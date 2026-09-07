import fs from "node:fs";
import { execSync } from "node:child_process";

const CDP_HTTP = "http://127.0.0.1:9223";

async function cdpCall(ws, method, params = {}) {
  const id = Math.floor(Math.random() * 1000000);
  const msg = { id, method, params };
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener("message", handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify(msg));
  });
}

async function processSlug(slug) {
  const res = await fetch(CDP_HTTP + "/json/list");
  let targets = await res.json();
  let geminiTarget = targets.find(t => t.url && t.url.includes("gemini.google.com"));

  if (!geminiTarget) {
    console.log("Creating new tab for gemini.google.com/videos...");
    const newRes = await fetch(CDP_HTTP + "/json/new?https://gemini.google.com/videos");
    geminiTarget = await newRes.json();
    await new Promise(r => setTimeout(r, 4000));
  }

  const ws = new WebSocket(geminiTarget.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  const q = JSON.parse(fs.readFileSync("/Users/markquiambao/GitHub/miqra-kodesh/scripts/anim-pilot/browser-queue/queue.json", "utf8"));
  const item = q.items.find(i => i.slug === slug);
  if (!item) {
    console.error("Item not found in queue:", slug);
    ws.close();
    return false;
  }

  const imagePath = item.stagedImage;
  let promptText = item.prompt;

  console.log(`=== Processing ${slug} (${item.name}) ===`);

  async function submitJob(promptToUse) {
    // 1. Navigate to Videos
    console.log("Navigating to https://gemini.google.com/videos...");
    await cdpCall(ws, "Page.navigate", { url: "https://gemini.google.com/videos" });
    await new Promise(r => setTimeout(r, 6000));

    // 2. Click aspect ratio selector and pick Portrait (9:16)
    console.log("Selecting Portrait mode...");
    await cdpCall(ws, "Runtime.evaluate", {
      expression: `(() => {
        const aspectBtn = Array.from(document.querySelectorAll("button, [role=button]")).find(b => b.innerText?.includes("16:9") || b.innerText?.includes("Portrait") || b.innerText?.includes("9:16") || b.getAttribute("aria-label")?.includes("Aspect"));
        if (aspectBtn) aspectBtn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 600));

    await cdpCall(ws, "Runtime.evaluate", {
      expression: `(() => {
        const portraitItem = Array.from(document.querySelectorAll("input-companion-item, [role=menuitemradio], [role=menuitem], .mat-mdc-menu-item")).find(el => el.getAttribute("aria-label")?.includes("Portrait") || el.innerText?.includes("Portrait") || el.innerText?.includes("9:16"));
        if (portraitItem) portraitItem.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 600));

    // 3. Upload image
    console.log(`Uploading ${imagePath}...`);
    const imageBase64 = fs.readFileSync(imagePath).toString("base64");
    await cdpCall(ws, "Runtime.evaluate", {
      expression: `(async () => {
        const b64 = "${imageBase64}";
        const byteChars = atob(b64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new File([byteArray], "${slug}.jpg", { type: "image/jpeg" });

        const dt = new DataTransfer();
        dt.items.add(file);

        const editor = document.querySelector(".ql-editor, rich-textarea, [contenteditable=true]") || document.activeElement;
        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clipboardData: dt
        });
        if (editor) editor.dispatchEvent(pasteEvent);

        const dropzone = document.querySelector(".xap-uploader-dropzone") || document.body;
        const dragOver = new DragEvent("dragover", { bubbles: true, cancelable: true, composed: true, dataTransfer: dt });
        const drop = new DragEvent("drop", { bubbles: true, cancelable: true, composed: true, dataTransfer: dt });
        dropzone.dispatchEvent(dragOver);
        dropzone.dispatchEvent(drop);
      })()`,
      awaitPromise: true
    });
    await new Promise(r => setTimeout(r, 3000));

    // 4. Insert prompt
    console.log("Entering prompt:", promptToUse);
    await cdpCall(ws, "Runtime.evaluate", {
      expression: `(() => {
        const ql = document.querySelector(".ql-editor");
        if (ql) {
          ql.focus();
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, ${JSON.stringify(promptToUse)});
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 1000));

    // 5. Submit ONCE
    console.log("Submitting prompt ONCE...");
    const beforeTime = Date.now();

    await cdpCall(ws, "Runtime.evaluate", {
      expression: `(() => {
        const sendBtn = Array.from(document.querySelectorAll("button, [role=button]")).find(b => b.getAttribute("aria-label")?.toLowerCase().includes("send") || b.classList.contains("send-button"));
        if (sendBtn) sendBtn.click();
      })()`
    });

    await new Promise(r => setTimeout(r, 5000));

    const convInfo = await cdpCall(ws, "Runtime.evaluate", {
      expression: `(() => ({ url: window.location.href, title: document.title, snippet: document.body.innerText.slice(-300) }))()`,
      returnByValue: true
    });
    const convUrl = convInfo.result?.value?.url || "https://gemini.google.com/videos";
    console.log(`Submitted! Conversation URL: ${convUrl}`);

    try {
      execSync(`node /Users/markquiambao/GitHub/miqra-kodesh/scripts/anim-pilot/gemini-app-queue.js mark ${slug} submitted --force --note "${convUrl}"`, { stdio: "inherit" });
    } catch(e) {
      console.warn("Could not mark submitted:", e.message);
    }

    // 6. Poll for completion
    console.log("Polling for video generation result...");
    const startTime = Date.now();
    let downloaded = false;
    let refusal = false;

    // wait at least 8s to avoid previous video detection
    await new Promise(r => setTimeout(r, 8000));

    while (Date.now() - startTime < 300000) {
      const status = await cdpCall(ws, "Runtime.evaluate", {
        expression: `(() => {
          const videos = Array.from(document.querySelectorAll("video")).map(v => ({
            src: v.src,
            currentSrc: v.currentSrc,
            duration: v.duration,
            readyState: v.readyState
          }));

          const downloadBtns = Array.from(document.querySelectorAll("button, [role=button], a")).filter(el => {
            const text = el.innerText?.toLowerCase() || "";
            const label = el.getAttribute("aria-label")?.toLowerCase() || "";
            return label.includes("download video") || text.includes("download") || label.includes("download");
          });

          const responses = Array.from(document.querySelectorAll("message-content, [class*=model-response]")).map(el => el.innerText?.trim()).filter(Boolean);
          const respText = responses.join(" ");
          const isRefusal = respText.includes("I can't make that type of video") || respText.includes("I can't generate that video") || respText.includes("Something went wrong");
          const isGenerating = respText.includes("Generating your video") || respText.includes("generating your video") || respText.includes("Analyzing");

          return {
            isGenerating,
            isRefusal,
            videoCount: videos.length,
            downloadBtnCount: downloadBtns.length,
            respText
          };
        })()`,
        returnByValue: true
      });

      const data = status.result?.value || {};
      console.log(`[${Math.round((Date.now() - startTime)/1000)}s] Generating: ${data.isGenerating}, Videos: ${data.videoCount}, DownloadBtns: ${data.downloadBtnCount}, Refusal: ${data.isRefusal}`);

      if (data.videoCount > 0 && data.downloadBtnCount > 0 && !data.isGenerating) {
        console.log("Video finished! Clicking Download video button ONCE...");
        await cdpCall(ws, "Runtime.evaluate", {
          expression: `(() => {
            const btn = Array.from(document.querySelectorAll("button, [role=button], a")).find(el => {
              const text = el.innerText?.toLowerCase() || "";
              const label = el.getAttribute("aria-label")?.toLowerCase() || "";
              return label.includes("download video") || text.includes("download") || label.includes("download");
            });
            if (btn) btn.click();
          })()`
        });

        // Wait patiently for file to write to ~/Downloads
        for (let wait = 0; wait < 20; wait++) {
          await new Promise(r => setTimeout(r, 2000));
          const currentDownloads = fs.readdirSync("/Users/markquiambao/Downloads");
          const stats = currentDownloads.filter(f => f.endsWith(".mp4") && !f.endsWith(".crdownload")).map(f => {
            const p = `/Users/markquiambao/Downloads/${f}`;
            return { file: f, path: p, mtime: fs.statSync(p).mtimeMs, size: fs.statSync(p).size };
          }).filter(f => f.mtime >= beforeTime - 2000).sort((a, b) => b.mtime - a.mtime);

          if (stats.length > 0) {
            console.log("Found downloaded file:", stats[0]);
            const targetMp4 = `/Users/markquiambao/GitHub/miqra-kodesh/scripts/anim-pilot/browser-queue/downloads/${slug}.mp4`;
            fs.copyFileSync(stats[0].path, targetMp4);
            console.log(`Copied ${stats[0].path} -> ${targetMp4}`);
            execSync(`node /Users/markquiambao/GitHub/miqra-kodesh/scripts/anim-pilot/gemini-app-queue.js attach ${slug} ${targetMp4}`, { stdio: "inherit" });
            downloaded = true;
            break;
          }
        }
        if (downloaded) break;
      }

      if (data.isRefusal) {
        console.log("Refusal detected:", data.respText);
        refusal = true;
        break;
      }

      await new Promise(r => setTimeout(r, 8000));
    }

    if (downloaded) {
      return true;
    }

    if (refusal) {
      return false;
    }
    return false;
  }

  let success = await submitJob(promptText);
  if (!success) {
    console.log("Retrying with clean fallback prompt: Animate this image so it looks good in a loop");
    promptText = "Animate this image so it looks good in a loop";
    success = await submitJob(promptText);
    if (!success) {
      execSync(`node /Users/markquiambao/GitHub/miqra-kodesh/scripts/anim-pilot/gemini-app-queue.js reject ${slug} --note "Generation refused with fallback prompt"`, { stdio: "inherit" });
    }
  }

  ws.close();
  return success;
}

const targetSlug = process.argv[2];
if (targetSlug) {
  processSlug(targetSlug).then(res => {
    console.log(`Finished processing ${targetSlug}: ${res ? "SUCCESS" : "FAILED"}`);
    process.exit(res ? 0 : 1);
  });
} else {
  console.log("Usage: node scripts/anim-pilot/run-batch-cdp.mjs <slug>");
}

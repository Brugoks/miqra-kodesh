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
        if (editor && editor.focus) editor.focus();
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
    await new Promise(r => setTimeout(r, 4000));

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
    await new Promise(r => setTimeout(r, 1500));

    // 5. Wait for image attachment & send button to be enabled
    console.log("Waiting for attachment and send button to be ready...");
    for (let w = 0; w < 30; w++) {
      const state = await cdpCall(ws, "Runtime.evaluate", {
        expression: `(() => {
          const sendBtn = Array.from(document.querySelectorAll("button, [role=button]")).find(b => b.getAttribute("aria-label")?.toLowerCase().includes("send"));
          const sendContainer = document.querySelector("[data-test-id=send-button-container], .send-button-container");
          const fieldset = document.querySelector("fieldset.input-area-fieldset");
          const hasAttachment = !!document.querySelector("[aria-label*='close attachment'], .attachment-container, [class*=file-preview]");
          const isEnabled = sendBtn && sendBtn.getAttribute("aria-disabled") !== "true" && (!fieldset || !fieldset.disabled) && (!sendContainer || !sendContainer.className.includes("disabled"));
          return { isEnabled: !!isEnabled, hasAttachment };
        })()`,
        returnByValue: true
      });
      if (state.result?.value?.isEnabled) {
        console.log(`Send button ready after ${w + 1}s`);
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log("Submitting prompt...");
    const beforeTime = Date.now();
    let convUrl = "https://gemini.google.com/videos";

    for (let attempt = 1; attempt <= 4; attempt++) {
      const box = await cdpCall(ws, "Runtime.evaluate", {
        expression: `(() => {
          const btn = Array.from(document.querySelectorAll("button, [role=button]")).find(b => b.getAttribute("aria-label")?.toLowerCase().includes("send") || b.classList.contains("send-button"));
          if (!btn) return null;
          const rect = btn.getBoundingClientRect();
          btn.click();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`,
        returnByValue: true
      });

      if (box.result?.value) {
        const { x, y } = box.result.value;
        await cdpCall(ws, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        await new Promise(r => setTimeout(r, 100));
        await cdpCall(ws, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
        await new Promise(r => setTimeout(r, 100));
        await cdpCall(ws, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      }

      for (let u = 0; u < 6; u++) {
        await new Promise(r => setTimeout(r, 1000));
        const curUrl = await cdpCall(ws, "Runtime.evaluate", { expression: `window.location.href`, returnByValue: true });
        if (curUrl.result?.value?.includes("/app/")) {
          convUrl = curUrl.result.value;
          break;
        }
      }
      if (convUrl.includes("/app/")) break;
      console.log(`Submission attempt ${attempt} did not transition URL, retrying...`);
    }

    if (!convUrl.includes("/app/")) {
      console.error("Failed to transition to conversation view after submission!");
      return { success: false, isQuota: false };
    }

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
    let pollCount = 0;

    // wait at least 8s to avoid previous video detection
    await new Promise(r => setTimeout(r, 8000));

    while (Date.now() - startTime < 900000) {
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
          const lastResp = responses[responses.length - 1] || "";
          const text = document.body.innerText || "";
          const isQuota = text.includes("out of videos") || text.includes("available again") || respText.includes("out of videos") || respText.includes("available again");
          const isRefusal = text.includes("can't generate that video") || text.includes("can't make that type of video") || text.includes("video policy guidelines") || lastResp.includes("Something went wrong") || text.includes("Something went wrong");
          const isVideoReady = downloadBtns.length > 0 && (videos.length > 0 || respText.includes("Your video is ready") || text.includes("Your video is ready"));

          return {
            isQuota,
            isRefusal,
            isVideoReady,
            videoCount: videos.length,
            downloadBtnCount: downloadBtns.length,
            lastResp
          };
        })()`,
        returnByValue: true
      });

      const data = status.result?.value || {};
      console.log(`[${Math.round((Date.now() - startTime)/1000)}s] Ready: ${data.isVideoReady}, Videos: ${data.videoCount}, DownloadBtns: ${data.downloadBtnCount}, Refusal: ${data.isRefusal}, Quota: ${data.isQuota}`);

      if (data.isVideoReady) {
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

      if (data.isQuota) {
        console.log("Quota exceeded detected!");
        return { success: false, isQuota: true };
      }

      if (data.isRefusal) {
        console.log("Refusal detected:", data.lastResp);
        refusal = true;
        break;
      }

      await new Promise(r => setTimeout(r, 8000));
    }

    if (downloaded) {
      return { success: true, isQuota: false };
    }

    if (refusal) {
      return { success: false, isQuota: false, isRefusal: true };
    }
    return { success: false, isQuota: false };
  }

  let result = await submitJob(promptText);
  if (result.isQuota) {
    console.log("Quota limit reached. Keeping item queued for next reset window.");
    execSync(`node /Users/markquiambao/GitHub/miqra-kodesh/scripts/anim-pilot/gemini-app-queue.js mark ${slug} queued --force --note "Quota limit reached; resets ~2:32 AM"`, { stdio: "inherit" });
    ws.close();
    return false;
  }
  if (!result.success && !result.isQuota) {
    console.log("Retrying with clean fallback prompt: Animate this image so it looks good in a loop");
    promptText = "Animate this image so it looks good in a loop";
    result = await submitJob(promptText);
    if (!result.success) {
      execSync(`node /Users/markquiambao/GitHub/miqra-kodesh/scripts/anim-pilot/gemini-app-queue.js reject ${slug} --note "Generation refused with fallback prompt"`, { stdio: "inherit" });
    }
  }

  ws.close();
  return result.success;
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

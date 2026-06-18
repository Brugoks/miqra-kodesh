/* global process, Buffer */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ── ENV VARS LOADER ──────────────────────────────────────────────────────────
const dotenvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false
  }
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  // 1. Look up the first user from the profiles table to assign as the owner
  console.log('Fetching first user profile...');
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, active_organization_id')
    .limit(1);

  if (profileErr || !profiles || profiles.length === 0) {
    console.error('Error fetching first profile user:', profileErr?.message || 'No profiles found');
    process.exit(1);
  }

  const targetUser = profiles[0];
  let organizationId = targetUser.active_organization_id;

  if (!organizationId) {
    console.log('No active organization ID on profile. Looking up default "charleston-baptist" organization...');
    const { data: orgs, error: orgErr } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', 'charleston-baptist')
      .limit(1);
    
    if (orgErr || !orgs || orgs.length === 0) {
      console.error('Error fetching default organization:', orgErr?.message || 'No organizations found');
      process.exit(1);
    }
    organizationId = orgs[0].id;
  }

  console.log(`Target User ID: ${targetUser.id}`);
  console.log(`Organization ID: ${organizationId}`);

  // 2. Create the test journal entry
  console.log('\nCreating test journal entry...');
  const testEntryId = `test_j_${Date.now()}`;
  const testEntry = {
    id: testEntryId,
    user_id: targetUser.id,
    organization_id: organizationId,
    title: 'AI Generation Test',
    body: 'private, share with groups only, public',
    visibility: 'private', // default
    scripture: 'General Reflections'
  };

  const { error: insertErr } = await supabase
    .from('journal_entries')
    .insert(testEntry);

  if (insertErr) {
    console.error('Error inserting test journal entry:', insertErr.message);
    process.exit(1);
  }
  console.log(`Created test journal entry with ID: ${testEntryId}`);

  // 3. Query all journal entries where summary or image_path is null
  console.log('\nFetching journal entries needing AI enrichment...');
  const { data: entries, error: fetchErr } = await supabase
    .from('journal_entries')
    .select('id, user_id, title, body, summary, image_path')
    .or('summary.is.null,image_path.is.null');

  if (fetchErr) {
    console.error('Error fetching journal entries:', fetchErr.message);
    process.exit(1);
  }

  console.log(`Found ${entries?.length || 0} journal entries missing summary or image_path.`);

  if (!entries || entries.length === 0) {
    console.log('No journal entries need processing. Done!');
    process.exit(0);
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    console.log(`\n[${i + 1}/${entries.length}] Processing journal "${entry.title}" (ID: ${entry.id})`);
    
    const updatePayload = {};

    // Generate summary if missing
    if (!entry.summary) {
      console.log('  -> Generating summary...');
      try {
        const { data: sumData, error: sumErr } = await supabase.functions.invoke('hf-proxy', {
          body: {
            prompt: `Summarize this journal reflection in a single short sentence (under 12 words) that captures all key thoughts. Do not include any introductory text, prefix, or signature. Just output the summary. Reflection: "${entry.body.trim()}"`,
            max_new_tokens: 60
          }
        });

        if (sumErr || !sumData?.text) {
          throw new Error(sumErr?.message || 'No summary text returned');
        }

        const summaryText = sumData.text.replace(/^["']|["']$/g, '').trim();
        updatePayload.summary = summaryText;
        console.log(`  -> Summary generated: "${summaryText}"`);
      } catch (err) {
        console.error(`  -> Failed to generate summary: ${err.message}`);
      }
    }

    // Generate artwork image if missing
    if (!entry.image_path) {
      console.log('  -> Generating visual prompt & image...');
      try {
        let artPrompt = `A serene cinematic biblical painting capturing the inner peace and reflection of: ${entry.body.trim().slice(0, 150)}`;
        const { data: artData, error: artErr } = await supabase.functions.invoke('hf-proxy', {
          body: {
            prompt: `You are an art director creating a single text-to-image prompt that captures the visual themes of this journal reflection: "${entry.body.trim()}". Write ONE concrete, cinematic scene under 50 words, with no readable text, words, or letters. Respond with ONLY the image description.`,
            max_new_tokens: 120
          }
        });

        if (!artErr && artData?.text) {
          artPrompt = artData.text.replace(/^["']|["']$/g, '').trim();
        }

        const finalPrompt = `${artPrompt}, oil painting style, fine art, reverent atmosphere, warm soft light, no text, no words, no watermark`;
        console.log(`  -> Visual prompt: "${finalPrompt}"`);

        const seed = Math.floor(Math.random() * 1000000);
        const { data: imgData, error: imgErr } = await supabase.functions.invoke('image-proxy', {
          body: { prompt: finalPrompt, seed, steps: 8 }
        });

        if (imgErr || !imgData?.image) {
          throw new Error(imgErr?.message || 'No image returned from proxy');
        }

        // Fetch generated image data
        console.log('  -> Downloading generated image...');
        let imageBuffer;
        let contentType = 'image/jpeg';
        
        if (imgData.image.startsWith('data:')) {
          const matches = imgData.image.match(/^data:([^;]+);base64,(.+)$/);
          if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 image data');
          }
          contentType = matches[1];
          imageBuffer = Buffer.from(matches[2], 'base64');
        } else {
          const imgResponse = await fetch(imgData.image);
          const arrayBuffer = await imgResponse.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
        }

        // Upload to Storage
        console.log('  -> Uploading to storage bucket "prayer-images"...');
        const storagePath = `${entry.user_id}/journal-${entry.id}-${Date.now()}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('prayer-images')
          .upload(storagePath, imageBuffer, { contentType });

        if (uploadErr) {
          throw uploadErr;
        }

        updatePayload.image_path = storagePath;
        console.log(`  -> Artwork uploaded to: ${storagePath}`);
      } catch (err) {
        console.error(`  -> Failed to generate/upload image: ${err.message}`);
      }
    }

    // Update DB if we have any changes
    if (Object.keys(updatePayload).length > 0) {
      console.log('  -> Updating database entry...');
      const { error: updateErr } = await supabase
        .from('journal_entries')
        .update(updatePayload)
        .eq('id', entry.id);

      if (updateErr) {
        console.error(`  -> Failed to update database row: ${updateErr.message}`);
      } else {
        console.log('  -> Row updated successfully.');
      }
    } else {
      console.log('  -> No changes needed for this entry.');
    }

    if (i < entries.length - 1) {
      await delay(1000); // rate-limiting safety delay
    }
  }

  console.log('\nAll journal entries processed!');
}

main().catch(err => {
  console.error('Unhandled error in script:', err);
  process.exit(1);
});

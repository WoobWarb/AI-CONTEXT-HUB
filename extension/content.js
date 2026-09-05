/**
 * AI Context Hub - Chrome Extension Content Script
 * Automatically bridges web chats (ChatGPT, Claude, DeepSeek, Gemini)
 * with the local AI Context Hub server running at http://localhost:4001
 */

(function () {
  if (window.__AI_CONTEXT_HUB_EXT_LOADED__) return;
  window.__AI_CONTEXT_HUB_EXT_LOADED__ = true;

  const HUB_ORIGIN = 'http://localhost:4001';
  let isConnected = false;
  let autoAgentEnabled = true;
  let processedSignatures = new Set();

  console.log('🤖 [AI Context Hub Extension] Loaded on:', window.location.hostname);

  // 1. Create floating overlay widget on the web chat page
  const widget = document.createElement('div');
  widget.id = 'ai-hub-extension-widget';
  widget.innerHTML = `
    <div style="
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999999;
      background: #181512;
      border: 1px solid #78350f;
      border-radius: 16px;
      padding: 16px 18px;
      color: #f5f5f4;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.7);
      width: 330px;
      line-height: 1.5;
      transition: all 0.2s ease;
    ">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 8px; font-weight: bold; color: #f59e0b; font-size: 15px;">
          <span id="ai-hub-dot" style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
          <span>AI Context Hub</span>
        </div>
        <span id="ai-hub-status-text" style="font-size: 12px; color: #a8a29e;">กำลังเชื่อมต่อ...</span>
      </div>

      <div id="ai-hub-project-name" style="font-size: 13px; color: #d6d3d1; margin-bottom: 12px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #0c0a09; padding: 4px 8px; border-radius: 8px; border: 1px solid #292524;">
        📁 ตรวจหาโฟลเดอร์...
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button id="ai-hub-insert-btn" style="
          background: #d97706;
          color: #0c0a09;
          font-weight: bold;
          border: none;
          border-radius: 10px;
          padding: 10px 12px;
          cursor: pointer;
          font-size: 13px;
          transition: background 0.15s;
        ">📥 แนบไฟล์ที่เลือกจาก AI Hub ลงแชทนี้</button>

        <button id="ai-hub-quick-refresh" style="
          background: #292524;
          color: #e7e5e4;
          border: 1px solid #44403c;
          border-radius: 10px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
        ">🔄 รีเฟรชการเชื่อมต่อ</button>
      </div>

      <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #292524; display: flex; align-items: center; justify-content: space-between;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: #d6d3d1;">
          <input type="checkbox" id="ai-hub-auto-agent" checked style="accent-color: #f59e0b; cursor: pointer; width: 15px; height: 15px;">
          <span>เปิด Auto-Agent (ให้ AI สร้าง/แก้ไฟล์เอง)</span>
        </label>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  // Widget event handlers
  document.getElementById('ai-hub-insert-btn').onclick = fetchAndInsertContext;
  document.getElementById('ai-hub-quick-refresh').onclick = checkConnection;
  document.getElementById('ai-hub-auto-agent').onchange = (e) => {
    autoAgentEnabled = e.target.checked;
  };

  function updateStatus(connected, projectName = '') {
    isConnected = connected;
    const dot = document.getElementById('ai-hub-dot');
    const txt = document.getElementById('ai-hub-status-text');
    const prj = document.getElementById('ai-hub-project-name');

    if (connected) {
      dot.style.background = '#10b981';
      txt.innerText = 'เชื่อมต่อแล้ว 🟢';
      txt.style.color = '#34d399';
      if (projectName) prj.innerText = `📁 ${projectName}`;
    } else {
      dot.style.background = '#ef4444';
      txt.innerText = 'ขาดการเชื่อมต่อ 🔴';
      txt.style.color = '#f87171';
      prj.innerText = 'เปิด start-hub.bat ไว้หรือไม่?';
    }
  }

  // 2. Chat Input Detectors & Injectors
  function findChatInput() {
    // 1. Google Gemini (rich-textarea or ql-editor or div[contenteditable="true"])
    const gemini = document.querySelector('rich-textarea div[contenteditable="true"]') ||
                   document.querySelector('div.ql-editor[contenteditable="true"]') ||
                   document.querySelector('div[contenteditable="true"][aria-label*="prompt"]') ||
                   document.querySelector('div[contenteditable="true"][aria-label*="Enter a prompt"]');
    if (gemini) return { el: gemini, type: 'contenteditable' };

    // 2. ChatGPT
    const chatgpt = document.querySelector('#prompt-textarea') || 
                    document.querySelector('div[contenteditable="true"][data-placeholder]') ||
                    document.querySelector('textarea[data-id="root"]');
    if (chatgpt) return { el: chatgpt, type: chatgpt.tagName === 'TEXTAREA' ? 'textarea' : 'contenteditable' };

    // 3. Claude
    const claude = document.querySelector('div.ProseMirror[contenteditable="true"]');
    if (claude) return { el: claude, type: 'contenteditable' };

    // 4. DeepSeek & generic
    const deepseek = document.querySelector('#chat-input') || 
                     document.querySelector('textarea');
    if (deepseek) return { el: deepseek, type: 'textarea' };

    // Fallback: any visible contenteditable
    const anyCe = document.querySelector('div[contenteditable="true"]');
    if (anyCe) return { el: anyCe, type: 'contenteditable' };

    return null;
  }

  function injectTextIntoInput(text) {
    const input = findChatInput();
    if (!input) {
      console.warn('🤖 AI Hub: ไม่พบช่องพิมพ์ข้อความของหน้าเว็บแชทนี้');
      return false;
    }

    const el = input.el;
    el.focus();

    if (input.type === 'textarea') {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Contenteditable (Gemini / Claude / ProseMirror / etc.)
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);

      // 1. Try simulated paste event first (preserves full multiline in Quill, ProseMirror, DraftJS)
      let pasted = false;
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const pasteEvt = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        });
        pasted = el.dispatchEvent(pasteEvt);
      } catch (e) {}

      // 2. Check if paste succeeded or if we should use insertText
      let currentLen = (el.innerText || el.textContent || '').trim().length;
      if (currentLen < text.trim().length * 0.5) {
        try {
          document.execCommand('insertText', false, text);
        } catch (e) {}
      }

      // 3. If Chrome execCommand truncated at newline, replace with paragraph elements
      currentLen = (el.innerText || el.textContent || '').trim().length;
      if (currentLen < text.trim().length * 0.5) {
        const lines = text.split('\n');
        el.innerHTML = lines.map(line => `<p>${line ? line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '<br>'}</p>`).join('');
      }

      // Dispatch comprehensive input events for Angular/React/Vue/Quill
      try {
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: text }));
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      } catch (e) {}
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
    }

    return true;
  }

  function clickSendButton() {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;

      const selectors = [
        'button[aria-label*="Send message"]',
        'button[aria-label*="ส่งข้อความ"]',
        'button[aria-label*="Send prompt"]',
        'button[aria-label*="ส่งคำสั่ง"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="ส่ง"]',
        'button.send-button',
        '.send-button-container button',
        'button[data-testid="send-button"]',
        'button[aria-label="Send Message"]',
        'fieldset button[type="submit"]',
        'form button[type="submit"]',
        '[role="button"][aria-label*="Send"]',
        '[role="button"][aria-label*="ส่ง"]'
      ];

      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn) {
          const isDisabled = btn.disabled || 
                             btn.getAttribute('aria-disabled') === 'true' || 
                             btn.classList.contains('disabled');
          if (!isDisabled) {
            btn.click();
            clearInterval(interval);
            console.log('🤖 AI Hub: Send button clicked successfully via', sel);
            return;
          }
        }
      }

      if (attempts >= 15) {
        clearInterval(interval);
        // Fallback: Dispatch Enter key
        const input = findChatInput();
        if (input && input.el) {
          input.el.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13
          }));
        }
      }
    }, 150);
  }

  // 3. Communications with Localhost Hub
  async function checkConnection() {
    try {
      const res = await fetch(`${HUB_ORIGIN}/api/tree`);
      const data = await res.json();
      updateStatus(true, data.projectName);
      return data;
    } catch (e) {
      updateStatus(false);
      return null;
    }
  }

  async function fetchAndInsertContext() {
    const btn = document.getElementById('ai-hub-insert-btn');
    const originalText = btn.innerText;
    btn.innerText = '⏳ กำลังดึง Context...';

    try {
      const res = await fetch(`${HUB_ORIGIN}/api/bridge/latest-context`);
      const data = await res.json();
      if (!data || !data.markdown) {
        alert('กรุณากดเลือกไฟล์ในหน้า AI Context Hub (http://localhost:4001) ก่อนครับ');
        btn.innerText = originalText;
        return;
      }

      const ok = injectTextIntoInput(data.markdown);
      if (ok) {
        btn.innerText = '✅ แนบข้อความเรียบร้อย!';
        setTimeout(() => { btn.innerText = originalText; }, 2000);
      }
    } catch (e) {
      alert('ไม่สามารถเชื่อมต่อกับ AI Context Hub ได้ (รัน start-hub.bat อยู่หรือไม่?)');
      btn.innerText = originalText;
    }
  }

  // 4. Polling loop for commands from AI Hub
  async function pollCommands() {
    try {
      const res = await fetch(`${HUB_ORIGIN}/api/bridge/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabUrl: window.location.href,
          tabTitle: document.title
        })
      });

      const data = await res.json();
      updateStatus(true, data.projectName);

      // If server doesn't have the latest response cached yet, force re-sync
      if (!data.hasResponse) {
        lastSyncedText = '';
      }

      // Process any queued commands from AI Hub
      if (Array.isArray(data.commands) && data.commands.length > 0) {
        for (const cmd of data.commands) {
          if (cmd.type === 'SEND_PROMPT') {
            console.log('🤖 AI Hub: Executing send command');
            injectTextIntoInput(cmd.text);
            if (cmd.autoSubmit) {
              clickSendButton();
            }
          }
        }
      }
    } catch (e) {
      updateStatus(false);
    }
  }

  // Helper to find latest assistant message across Gemini, ChatGPT, Claude, DeepSeek
  function getLatestAiMessageElement() {
    const selectors = [
      'message-content',
      'model-response',
      '[data-message-author-role="assistant"]',
      '.font-claude-message',
      '.assistant-message',
      'div[class*="agent-response"]',
      'div[class*="model-response"]',
      'div.response-container-content',
      '.markdown'
    ];

    for (const selector of selectors) {
      try {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
          return els[els.length - 1];
        }
      } catch (e) {}
    }
    return null;
  }

  // Extract files from AI response using multiple formats:
  // 1. [WRITE_FILE: filename]\n```...```
  // 2. cat <<'EOF' > filename\n...\nEOF (Gemini bash script format)
  // 3. สร้างไฟล์ filename / Create file filename followed by code block
  function extractFilesFromText(text) {
    const files = [];

    // Pattern 1: [WRITE_FILE: path/to/file.ext] (Supports with or without markdown backticks)
    const writeRegex = /\[WRITE_FILE:\s*([^\]\r\n]+)\][\s\r\n]*(?:```[^\r\n]*[\r\n])?([\s\S]*?)(?:```|(?=\[WRITE_FILE:|$))/gi;
    let match;
    while ((match = writeRegex.exec(text)) !== null) {
      const filePath = match[1].trim().replace(/^['"`]|['"`]$/g, '');
      const content = match[2].trim();
      if (filePath && content) {
        files.push({ filePath, content });
      }
    }

    // Pattern 2: Bash cat script e.g. cat <<'EOF' > docker-compose.yml ... EOF
    const bashCatRegex = /cat\s+<<\s*['"]?([a-zA-Z0-9_]+)['"]?\s*>\s*([^\s\r\n'"]+)[\r\n]+([\s\S]*?)[\r\n]+\1/gi;
    while ((match = bashCatRegex.exec(text)) !== null) {
      let filePath = match[2].trim().replace(/^['"`.]\/?|['"`]$/g, '').replace(/^\.\//, '');
      const content = match[3];
      if (filePath && !files.some(f => f.filePath === filePath)) {
        files.push({ filePath, content });
      }
    }

    // Pattern 3: Explicit text like "สร้างไฟล์ docker-compose.yml" followed by ```...```
    const descRegex = /(?:สร้างไฟล์|เขียนไฟล์|บันทึกไฟล์|Save to file|Create file|File:)\s*[`'"]?([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)[`'"]?[\s\S]{0,120}?```[a-zA-Z0-9_-]*[\r\n]([\s\S]*?)```/gi;
    while ((match = descRegex.exec(text)) !== null) {
      let filePath = match[1].trim().replace(/^['"`.]\/?|['"`]$/g, '').replace(/^\.\//, '');
      const content = match[2];
      if (filePath && !files.some(f => f.filePath === filePath)) {
        files.push({ filePath, content });
      }
    }

    return files;
  }

  // 5. Continuous AI Response Syncing & Auto-Agent
  let lastSyncedText = '';
  async function syncAndCheckAgent() {
    const latestEl = getLatestAiMessageElement();
    if (!latestEl) return;

    const text = (latestEl.innerText || '').trim();
    if (!text) return;

    // 5.1 Sync latest response to AI Context Hub
    if (text !== lastSyncedText) {
      lastSyncedText = text;
      try {
        fetch(`${HUB_ORIGIN}/api/bridge/ai-response`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, time: Date.now() })
        }).catch(() => {});
      } catch (e) {}
    }

    if (!autoAgentEnabled) return;

    const sig = text.slice(-80) + text.length;
    if (processedSignatures.has(sig)) return;

    // 5.2 Check for READ_FILE pattern
    const readMatch = text.match(/\[READ_FILE:\s*([^\s\]]+)\]/i) || text.match(/READ_FILE:\s*([^\s\n]+)/i);
    if (readMatch) {
      const filePath = readMatch[1].trim();
      processedSignatures.add(sig);
      console.log(`🤖 Auto-Agent: AI requested to read file: ${filePath}`);

      try {
        const fileRes = await fetch(`${HUB_ORIGIN}/api/file?path=${encodeURIComponent(filePath)}`);
        const fileData = await fileRes.json();
        
        let reply = '';
        if (fileData.content !== undefined) {
          reply = `[SYSTEM: นี่คือเนื้อหาของไฟล์ \`${filePath}\` จากเครื่อง]\n\`\`\`\n${fileData.content}\n\`\`\``;
        } else {
          reply = `[SYSTEM: ไม่พบไฟล์ \`${filePath}\` ในโปรเจกต์]`;
        }

        injectTextIntoInput(reply);
        clickSendButton();
      } catch (e) {}
      return;
    }

    // 5.3 Check for files to WRITE (Supports [WRITE_FILE: ...], cat <<'EOF' > ..., and markdown blocks)
    const filesToWrite = extractFilesFromText(text);
    if (filesToWrite.length > 0) {
      processedSignatures.add(sig);
      const results = [];

      for (const file of filesToWrite) {
        console.log(`🤖 Auto-Agent: Writing file to local machine: ${file.filePath}`);

        try {
          const saveRes = await fetch(`${HUB_ORIGIN}/api/file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: file.filePath, content: file.content })
          });
          const saveData = await saveRes.json();

          if (saveData.success) {
            results.push(`✅ บันทึกไฟล์ \`${file.filePath}\` ลงเครื่องเรียบร้อยแล้ว`);
            // Show badge on widget
            const prj = document.getElementById('ai-hub-project-name');
            if (prj) prj.innerText = `💾 บันทึก: ${file.filePath}`;
          } else {
            results.push(`❌ บันทึกไฟล์ \`${file.filePath}\` ล้มเหลว: ${saveData.error}`);
          }
        } catch (e) {
          results.push(`❌ เกิดข้อผิดพลาดกับไฟล์ \`${file.filePath}\`: ${e.message}`);
        }
      }

      if (results.length > 0) {
        console.log('🤖 Auto-Agent results:', results.join('\n'));
      }
    }
  }

  // Start polling
  checkConnection();
  setInterval(pollCommands, 2000);
  setInterval(syncAndCheckAgent, 1500);
})();

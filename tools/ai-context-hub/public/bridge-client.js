/**
 * AI Context Hub - Web Chat Bridge Client
 * Runs inside web chat tabs (ChatGPT, Claude, DeepSeek, etc.)
 * Connects the web session with local files on http://localhost:4001
 */

(function () {
  if (window.__AI_CONTEXT_HUB_BRIDGE_LOADED__) {
    console.log('🤖 AI Context Hub Bridge is already active.');
    return;
  }
  window.__AI_CONTEXT_HUB_BRIDGE_LOADED__ = true;

  const HUB_ORIGIN = 'http://localhost:4001';
  let isConnected = false;
  let autoAgentEnabled = true;
  let processedMsgSignatures = new Set();

  console.log('🚀 Loading AI Context Hub Web Bridge...');

  // 1. Create floating overlay widget
  const widget = document.createElement('div');
  widget.id = 'ai-hub-bridge-widget';
  widget.innerHTML = `
    <div style="
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: #181512;
      border: 1px solid #78350f;
      border-radius: 16px;
      padding: 14px 16px;
      color: #f5f5f4;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      width: 290px;
      line-height: 1.4;
      transition: all 0.2s ease;
    ">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; font-weight: bold; color: #f59e0b;">
          <span id="ai-hub-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
          <span>AI Context Hub</span>
        </div>
        <span id="ai-hub-status-text" style="font-size: 10px; color: #a8a29e;">กำลังเชื่อมต่อ...</span>
      </div>

      <div id="ai-hub-project-name" style="font-size: 11px; color: #d6d3d1; margin-bottom: 10px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        📁 ตรวจหาโฟลเดอร์...
      </div>

      <div style="display: flex; flex-direction: column; gap: 6px;">
        <button id="ai-hub-insert-btn" style="
          background: #d97706;
          color: #0c0a09;
          font-weight: bold;
          border: none;
          border-radius: 10px;
          padding: 7px 10px;
          cursor: pointer;
          font-size: 11px;
          transition: background 0.15s;
        ">📥 แนบ Context จาก AI Hub ลงแชทนี้</button>

        <button id="ai-hub-quick-refresh" style="
          background: #292524;
          color: #e7e5e4;
          border: 1px solid #44403c;
          border-radius: 10px;
          padding: 6px 10px;
          cursor: pointer;
          font-size: 11px;
        ">🔄 รีเฟรชสถานะ</button>
      </div>

      <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #292524; display: flex; align-items: center; justify-content: space-between;">
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 10px; color: #a8a29e;">
          <input type="checkbox" id="ai-hub-auto-agent" checked style="accent-color: #f59e0b; cursor: pointer;">
          <span>เปิด Auto-File Agent (ให้ AI อ่านไฟล์เอง)</span>
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
      dot.style.background = '#10b981'; // Green
      txt.innerText = 'เชื่อมต่อแล้ว 🟢';
      txt.style.color = '#34d399';
      if (projectName) prj.innerText = `📁 ${projectName}`;
    } else {
      dot.style.background = '#ef4444'; // Red
      txt.innerText = 'ขาดการเชื่อมต่อ 🔴';
      txt.style.color = '#f87171';
      prj.innerText = 'กรุณาเปิด start-hub.bat';
    }
  }

  // 2. Chat Input Detectors & Injectors
  function findChatInput() {
    // 1. ChatGPT
    const chatgpt = document.querySelector('#prompt-textarea') || 
                    document.querySelector('div[contenteditable="true"][data-placeholder]') ||
                    document.querySelector('textarea[data-id="root"]');
    if (chatgpt) return { el: chatgpt, type: chatgpt.tagName === 'TEXTAREA' ? 'textarea' : 'contenteditable' };

    // 2. Claude
    const claude = document.querySelector('div.ProseMirror[contenteditable="true"]') ||
                   document.querySelector('div[contenteditable="true"]');
    if (claude) return { el: claude, type: 'contenteditable' };

    // 3. DeepSeek & generic
    const deepseek = document.querySelector('#chat-input') || 
                     document.querySelector('textarea');
    if (deepseek) return { el: deepseek, type: 'textarea' };

    return null;
  }

  function injectTextIntoInput(text) {
    const input = findChatInput();
    if (!input) {
      alert('ไม่พบช่องพิมพ์ข้อความของหน้าเว็บแชทนี้');
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
      // Contenteditable (Claude / ProseMirror)
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    return true;
  }

  function isStopButton(btn) {
    if (!btn) return false;
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    const title = (btn.getAttribute('title') || '').toLowerCase();
    const testId = (btn.getAttribute('data-testid') || btn.getAttribute('data-test-id') || '').toLowerCase();
    const text = (btn.innerText || '').toLowerCase();

    if (label.includes('stop') || label.includes('หยุด') || label.includes('cancel') || label.includes('ยกเลิก')) return true;
    if (title.includes('stop') || title.includes('หยุด')) return true;
    if (testId.includes('stop')) return true;
    if (text.includes('stop') || text.includes('หยุด')) return true;
    if (btn.querySelector('mat-icon[fonticon="stop"], svg.icon-stop, [class*="stop"]')) return true;
    return false;
  }

  function isAiGenerating() {
    const stopSelectors = [
      'button[aria-label*="Stop" i]',
      'button[aria-label*="หยุด" i]',
      'button[data-testid*="stop" i]',
      'button[data-test-id*="stop" i]',
      'button.stop-button',
      'button[aria-label*="Cancel" i]',
      'button[aria-label*="ยกเลิก" i]',
      'mat-icon[fonticon="stop"]',
      'button:has(mat-icon[fonticon="stop"])',
      'button:has(svg.icon-stop)',
      'button.stop-generating-button',
      'button[aria-label*="Stop response" i]',
      'button[aria-label*="หยุดสร้างการตอบกลับ" i]',
      'button[aria-label*="หยุดการตอบกลับ" i]'
    ];

    for (const sel of stopSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          return true;
        }
      } catch (e) {}
    }

    const streamIndicators = [
      '.result-streaming',
      '.streaming',
      '.typing-indicator',
      'model-response.generating',
      '[data-is-streaming="true"]',
      '.cursor-blink'
    ];

    for (const sel of streamIndicators) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          return true;
        }
      } catch (e) {}
    }

    return false;
  }

  let bridgeSendInterval = null;
  function clickSendButton() {
    if (bridgeSendInterval) clearInterval(bridgeSendInterval);
    let attempts = 0;
    bridgeSendInterval = setInterval(() => {
      attempts++;

      // If AI is still generating, wait!
      if (isAiGenerating()) {
        if (attempts >= 40) {
          clearInterval(bridgeSendInterval);
          bridgeSendInterval = null;
        }
        return;
      }

      const selectors = [
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label*="Send" i]',
        'button[aria-label*="ส่ง" i]',
        'button.send-button',
        '.send-button-container button',
        'fieldset button[type="submit"]',
        'form button[type="submit"]',
        'div[aria-label="Send message"] button'
      ];

      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn && !isStopButton(btn)) {
          const isDisabled = btn.disabled || 
                             btn.getAttribute('aria-disabled') === 'true' || 
                             btn.classList.contains('disabled');
          if (!isDisabled) {
            btn.click();
            clearInterval(bridgeSendInterval);
            bridgeSendInterval = null;
            return true;
          }
        }
      }

      if (attempts >= 20) {
        clearInterval(bridgeSendInterval);
        bridgeSendInterval = null;
        if (!isAiGenerating()) {
          const input = findChatInput();
          if (input && input.el) {
            input.el.dispatchEvent(new KeyboardEvent('keydown', {
              bubbles: true,
              cancelable: true,
              key: 'Enter',
              code: 'Enter',
              keyCode: 13
            }));
          }
        }
      }
    }, 200);
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
        alert('กรุณาเลือกไฟล์ในหน้า AI Context Hub (http://localhost:4001) ก่อนครับ');
        return;
      }

      const ok = injectTextIntoInput(data.markdown);
      if (ok) {
        btn.innerText = '✅ แนบข้อความเรียบร้อย!';
        setTimeout(() => { btn.innerText = originalText; }, 2000);
      }
    } catch (e) {
      alert('ไม่สามารถเชื่อมต่อกับ AI Context Hub ได้ (เปิด http://localhost:4001 อยู่หรือไม่?)');
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

      // Process any queued commands from AI Hub
      if (Array.isArray(data.commands) && data.commands.length > 0) {
        for (const cmd of data.commands) {
          if (cmd.type === 'SEND_PROMPT') {
            console.log('🤖 AI Hub: Received send command');
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

  // 5. Autonomous File Assistant (Auto-Agent)
  let lastBridgeObservedText = '';
  let lastBridgeChangeTime = 0;

  async function checkForAgentInstructions() {
    if (!autoAgentEnabled) return;

    // Grab latest AI message text
    const messageContainers = document.querySelectorAll('[data-message-author-role="assistant"], .font-claude-message, .assistant-message, div[class*="agent-response"]');
    if (messageContainers.length === 0) return;

    const latestMsg = messageContainers[messageContainers.length - 1];
    const text = (latestMsg.innerText || '').trim();
    if (!text) return;

    // Check if AI is still actively typing/streaming
    if (text !== lastBridgeObservedText) {
      lastBridgeObservedText = text;
      lastBridgeChangeTime = Date.now();
      return; // Still generating text! Wait!
    }

    // Must be completely stable for at least 1.8 seconds
    if (Date.now() - lastBridgeChangeTime < 1800) {
      return; // Wait for streaming to finish completely
    }

    // Check DOM for active Stop/Generating buttons
    if (isAiGenerating()) {
      return; // Stop button is still visible, wait!
    }

    // Message is completely finished! Compute unique signature
    const sig = text.length + '::' + text.slice(0, 60) + '::' + text.slice(-60);
    if (processedMsgSignatures.has(sig)) return;

    // Check for READ_FILE pattern (batch read support)
    const readMatches = [
      ...text.matchAll(/\[READ_FILE:\s*([^\]\r\n]+)\]/gi),
      ...text.matchAll(/READ_FILE:\s*([^\s\r\n]+)/gi)
    ];

    if (readMatches.length > 0) {
      processedMsgSignatures.add(sig);
      const filePaths = [...new Set(readMatches.map(m => m[1].trim().replace(/^['"`]|['"`]$/g, '')))].filter(Boolean);
      console.log('🤖 Auto-Agent: AI requested to read files:', filePaths);

      let aggregatedReplies = [];
      for (const filePath of filePaths) {
        try {
          const fileRes = await fetch(`${HUB_ORIGIN}/api/file?path=${encodeURIComponent(filePath)}`);
          const fileData = await fileRes.json();
          if (fileData.content !== undefined) {
            aggregatedReplies.push(`#### 📄 เนื้อหาไฟล์ \`${filePath}\` จากเครื่อง:\n\`\`\`\n${fileData.content}\n\`\`\``);
          } else {
            aggregatedReplies.push(`#### ⚠️ ไม่พบไฟล์ \`${filePath}\` ในโปรเจกต์`);
          }
        } catch (e) {
          aggregatedReplies.push(`#### ⚠️ ไม่สามารถอ่านไฟล์ \`${filePath}\` ได้: ${e.message}`);
        }
      }

      if (aggregatedReplies.length > 0) {
        const fullPrompt = `[SYSTEM: ข้อมูลไฟล์ที่ร้องขอจากเครื่อง]\n\n${aggregatedReplies.join('\n\n---\n\n')}\n\nกรุณาดำเนินการวิเคราะห์หรือเขียนโค้ดต่อได้เลยครับ`;
        injectTextIntoInput(fullPrompt);
        setTimeout(() => {
          clickSendButton();
        }, 300);
      }
      return;
    }

    // Check for WRITE_FILE pattern
    const writeMatch = text.match(/\[WRITE_FILE:\s*([^\s\]]+)\]\s*```[\w]*\n([\s\S]*?)```/i);
    if (writeMatch) {
      const filePath = writeMatch[1];
      const newContent = writeMatch[2];
      processedMsgSignatures.add(sig);
      console.log(`🤖 Auto-Agent: AI requested to write file: ${filePath}`);

      try {
        const saveRes = await fetch(`${HUB_ORIGIN}/api/file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, content: newContent })
        });
        const saveData = await saveRes.json();

        let reply = '';
        if (saveData.success) {
          reply = `[SYSTEM: บันทึกไฟล์ \`${filePath}\` เรียบร้อยแล้ว (สำรองไฟล์เดิมไว้ใน .ai-hub/backups)]`;
        } else {
          reply = `[SYSTEM: เกิดข้อผิดพลาดในการบันทึกไฟล์ \`${filePath}\`: ${saveData.error}]`;
        }

        injectTextIntoInput(reply);
        setTimeout(() => {
          clickSendButton();
        }, 300);
      } catch (e) {}
    }
  }

  // Start polling
  checkConnection();
  setInterval(pollCommands, 2500);
  setInterval(checkForAgentInstructions, 1500);

  console.log('✅ AI Context Hub Bridge Client is ready!');
})();

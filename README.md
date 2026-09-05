# AI Context Hub & Web Chat Bridge

เชื่อมต่อเครื่องคอมพิวเตอร์ของคุณเข้ากับ AI บนหน้าเว็บฟรี (Google Gemini, ChatGPT, Claude, DeepSeek) ผ่าน Chrome Extension เพื่อสร้างโค้ด อ่านไฟล์ และสั่งรัน Terminal อัตโนมัติ โดยไม่ต้องเสียเงินค่า API Key หรือรอโควตาโทเค็นใน IDE

---

## ✨ ความสามารถหลัก (Features)

1. **Autonomous File Creation**: เมื่อ AI บนหน้าเว็บแชทตอบโค้ดหรือไฟล์ (เช่น `docker-compose.yml`, `app.py`) ระบบจะดักจับและเขียนไฟล์ลงเครื่องจริงในโฟลเดอร์โปรเจกต์ของคุณทันที
2. **Context Hub & Multi-File Exporter**: รวมโค้ดในโปรเจกต์หลายไฟล์ จัดเป็น Markdown พร้อมตัวเลข Token ประมาณการ ส่งเข้าหน้าเว็บแชทได้ในคลิกเดียว
3. **One-Click Send (`Ctrl + Enter`)**: พิมพ์คำสั่งจากหน้า Hub แล้วกด `Ctrl + Enter` เพื่อส่งตรงเข้าช่องแชทของ Gemini/ChatGPT และสั่งส่งคำถามอัตโนมัติ
4. **Terminal Command Runner**: ตรวจจับคำสั่งที่ AI แนะนำ (เช่น `docker compose up -d`, `npm install`) พร้อมปุ่มกดรันคำสั่งลงในเครื่องได้ทันที
5. **Zero Token Quota Dependence**: ใช้หน้าเว็บฟรีของโมเดลตัวท็อป ทำงานเป็น AI Agent ในเครื่องได้ตลอดเวลา

---

## 🚀 วิธีเริ่มต้นใช้งาน (Quick Start)

### 1. เปิดเซิร์ฟเวอร์ Local Hub
ดับเบิ้ลคลิกไฟล์ `start-hub.bat` หรือรัน:
```bash
npm install
npm start
```
ระบบจะเปิดหน้าเว็บที่ `http://localhost:4001`

### 2. ติดตั้ง Chrome Extension
1. เปิด Google Chrome แล้วไปที่ `chrome://extensions`
2. เปิดโหมด **"Developer mode" (โหมดนักพัฒนา)** ที่มุมขวาบน
3. กด **"Load unpacked" (โหลดส่วนขยายที่ยังไม่ได้แพ็ก)**
4. เลือกโฟลเดอร์ `extension/` ในโปรเจกต์นี้

### 3. เริ่มใช้งาน
1. เปิดแท็บ Web Chat ที่คุณต้องการ เช่น [Google Gemini](https://gemini.google.com/app), [ChatGPT](https://chatgpt.com), หรือ [Claude](https://claude.ai)
2. สังเกตวิดเจ็ต **AI Context Hub** สีส้ม-ดำที่มุมขวาล่าง จะขึ้นสถานะ `🟢 เชื่อมต่อแล้ว`
3. สั่งงานได้ทันที!

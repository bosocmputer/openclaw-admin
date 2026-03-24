export default function GuidePage() {
  return (
    <div className="space-y-8 w-full max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">คู่มือสำหรับผู้ใช้งาน</h1>
        <p className="text-sm text-zinc-500 mt-1">ส่งหน้านี้ให้ลูกค้า — ทำตามขั้นตอนได้เลยโดยไม่ต้องถาม Admin</p>
      </div>

      {/* Step 1 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-sm font-bold shrink-0">1</span>
          <h2 className="text-lg font-semibold">หา Telegram User ID ของคุณ</h2>
        </div>
        <div className="ml-11 space-y-2">
          <div className="border rounded-xl p-4 bg-zinc-50 dark:bg-zinc-900 space-y-2">
            <p className="text-sm">1. เปิด Telegram แล้วค้นหา <span className="font-mono bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-xs">@userinfobot</span></p>
            <p className="text-sm">2. กด <span className="font-semibold">Start</span> หรือพิมพ์ <span className="font-mono bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-xs">/start</span></p>
            <p className="text-sm">3. Bot จะตอบว่า <span className="font-mono bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-xs">Your ID: 1234567890</span></p>
            <p className="text-sm">4. <span className="font-semibold text-blue-600 dark:text-blue-400">จด ID นั้นไว้ แล้วส่งให้ Admin</span></p>
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-sm font-bold shrink-0">2</span>
          <h2 className="text-lg font-semibold">รอ Admin เพิ่มสิทธิ์ให้คุณ</h2>
        </div>
        <div className="ml-11">
          <div className="border rounded-xl p-4 bg-zinc-50 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500">Admin จะนำ ID ของคุณไปเพิ่มในระบบ — รอรับแจ้งจาก Admin ก่อนไปขั้นตอนถัดไป</p>
          </div>
        </div>
      </div>

      {/* Step 3 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-sm font-bold shrink-0">3</span>
          <h2 className="text-lg font-semibold">เริ่มใช้งาน Bot</h2>
        </div>
        <div className="ml-11 space-y-2">
          <div className="border rounded-xl p-4 bg-zinc-50 dark:bg-zinc-900 space-y-2">
            <p className="text-sm">1. เปิด Telegram ค้นหาชื่อ Bot ที่ Admin แจ้ง เช่น <span className="font-mono bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-xs">@sml_sale_bot</span></p>
            <p className="text-sm">2. กด <span className="font-semibold">Start</span></p>
            <p className="text-sm">3. พิมพ์ข้อความถามได้เลย — Bot จะตอบทันที</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="border rounded-xl p-5 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 space-y-3">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">สรุป — สิ่งที่ต้องส่งให้ Admin</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-blue-700 dark:text-blue-300 border-b border-blue-200 dark:border-blue-700">
              <th className="pb-2 font-medium w-40">ข้อมูล</th>
              <th className="pb-2 font-medium">วิธีหา</th>
            </tr>
          </thead>
          <tbody className="text-blue-800 dark:text-blue-200">
            <tr className="border-b border-blue-100 dark:border-blue-800">
              <td className="py-2 font-medium">Telegram User ID</td>
              <td className="py-2">พิมพ์ <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-xs">/start</span> ใน <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-xs">@userinfobot</span></td>
            </tr>
            <tr>
              <td className="py-2 font-medium">ชื่อ / แผนก</td>
              <td className="py-2 text-blue-700 dark:text-blue-300">เพื่อให้ Admin ตั้ง Nickname และผูก Agent ที่เหมาะสม</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Troubleshoot */}
      <div className="border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold">Bot ไม่ตอบ?</h3>
        <ul className="text-sm text-zinc-500 space-y-1 list-disc list-inside">
          <li>ตรวจสอบว่า Admin เพิ่ม Telegram User ID ของคุณแล้ว</li>
          <li>ลอง Start bot อีกครั้ง หรือส่งข้อความใหม่</li>
          <li>ถ้า Bot ตอบว่า &quot;ไม่มีสิทธิ์&quot; — แจ้ง Admin ให้เช็ค ID อีกครั้ง</li>
          <li>ติดต่อ Admin ถ้ายังไม่ได้รับการเพิ่มสิทธิ์หลังรอ 5 นาที</li>
        </ul>
      </div>
    </div>
  )
}

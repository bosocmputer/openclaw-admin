'use client'

// Alias ของ /oauth/callback — รับ redirect จาก claude.ai ที่ path /callback
// User แค่เปลี่ยน localhost:53692 → server:3000 แล้ว path /callback ยังตรงอยู่
export { default } from '@/app/oauth/callback/page'

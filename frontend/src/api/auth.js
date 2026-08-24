import { apiPost, apiPut } from "./client";

// login ไม่ผูก token เดิม (ยังไม่มี) และไม่ต้องการให้ 401 สั่ง redirect
export const login = (username, password) =>
    apiPost("/login", { username, password }, { auth: false });

export const changePassword = (currentPassword, newPassword) =>
    apiPut("/admin/password", { current_password: currentPassword, new_password: newPassword });

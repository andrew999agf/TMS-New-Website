"use server";

import { booksResetPassword } from "@/lib/books/auth";

export async function resetAction(userId: number, token: string, password: string) { return booksResetPassword(userId, token, password); }

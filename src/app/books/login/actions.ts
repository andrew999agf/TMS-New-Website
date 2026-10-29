"use server";

import { booksLoginStart, booksLoginVerify } from "@/lib/books/auth";

export async function startAction(email: string, password: string) { return booksLoginStart(email, password); }
export async function verifyAction(email: string, code: string) { return booksLoginVerify(email, code); }

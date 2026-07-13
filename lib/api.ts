import { ZodError } from "zod";
import { ApiError, jsonError, noStore } from "./http";

export async function apiRoute<T>(operation: () => Promise<T>, successStatus = 200) {
  try {
    return noStore(await operation(), { status: successStatus });
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error);
    if (error instanceof ZodError) return noStore({ error: "Validation failed", code: "validation_error", fields: error.flatten().fieldErrors }, { status: 400 });
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return noStore({ error: "A record with that value already exists", code: "conflict" }, { status: 409 });
    if (typeof error === "object" && error && "code" in error && error.code === "23503") return noStore({ error: "This record is still referenced and cannot be changed", code: "referenced" }, { status: 409 });
    console.error(error);
    return noStore({ error: "An unexpected error occurred", code: "internal_error" }, { status: 500 });
  }
}

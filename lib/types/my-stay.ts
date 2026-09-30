export type MyStayErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "BOOKING_NOT_FOUND"
  | "BOOKING_DATA_INCOMPLETE"
  | "CREDENTIAL_RPC_ERROR"
  | "DB_QUERY_ERROR";

export class MyStayError extends Error {
  code: MyStayErrorCode;

  constructor(code: MyStayErrorCode, message: string) {
    super(message);
    this.name = "MyStayError";
    this.code = code;
  }
}

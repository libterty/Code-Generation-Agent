export type ErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export function toErrorResponse(code: string, message: string): ErrorResponse {
  return {
    error: {
      code,
      message,
    },
  };
}

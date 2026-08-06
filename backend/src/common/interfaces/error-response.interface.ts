export interface ApiErrorDetail {
  field: string;
  code: string;
  message: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ErrorResponse {
  error: ApiError;
}

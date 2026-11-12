// Errores de aplicación con código y status HTTP. El mensaje es seguro para el cliente.
export class AppError extends Error {
  constructor(code, message, status = 500, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class NotImplementedError extends AppError {
  constructor(what) {
    super('NOT_IMPLEMENTED', `${what} aún no está implementado`, 501);
  }
}

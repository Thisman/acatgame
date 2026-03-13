export const ERROR_CODES = {
  ROOM_CLOSED: 'room_closed',
  ROOM_FULL: 'room_full',
  ROOM_UNAVAILABLE: 'room_unavailable',
  ROOM_WAITING_FOR_PLAYERS: 'room_waiting_for_players',
  READY_CHANGE_FORBIDDEN: 'ready_change_forbidden',
  READY_SELECTION_INVALID: 'ready_selection_invalid',
  READY_SELECTION_REQUIRED: 'ready_selection_required',
  ROOM_NOT_FOUND: 'room_not_found',
  INVALID_ROOM_SESSION: 'invalid_room_session',
  INTERNAL_SERVER_ERROR: 'internal_server_error',
  LOBBY_REQUEST_FAILED: 'lobby_request_failed',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

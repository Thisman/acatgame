import { RoomController } from './room-controller.js';

const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:8000';

export const roomController = new RoomController(serverUrl);


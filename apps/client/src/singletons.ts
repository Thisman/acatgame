import { RoomController } from './room-controller.js';

const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim();
const serverUrl = configuredServerUrl && configuredServerUrl.length > 0 ? configuredServerUrl : '';

export const roomController = new RoomController(serverUrl);

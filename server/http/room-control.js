import { roomControlSnapshot as localSnapshot, applyRoomControl as localApply } from '../match/adminRoomControl.js';

function hostedRoom(srv, command) {
  const room = srv.lobby.rooms.get(command?.roomCode);
  if (!room?.match?.hosted) return null;
  if (room.disposed || room.modded) throw Error('该房间不支持后台干预');
  return room;
}

function roomIdentity(room) {
  return { code: room.code, createdAt: room.createdAt ?? null, matchCount: room.matchCount ?? 0 };
}

export function roomControlSnapshot(srv, command) {
  const room = hostedRoom(srv, command);
  if (!room) return localSnapshot(srv, command);
  return room.match.monitorRoomControl(roomIdentity(room), null).then(result => {
    if (result?.error) throw Error(result.detail || result.error);
    return { ...result, hosted: true };
  });
}

export function applyRoomControl(srv, command) {
  const room = hostedRoom(srv, command);
  if (!room) return localApply(srv, command);
  if (!['pool', 'pressure', 'autoplay', 'manualAI', 'aiCommand'].includes(command.action)) {
    throw Error('规程房间的席位移除和接替请在游戏内操作');
  }
  return room.match.monitorRoomControl(roomIdentity(room), command).then(result => {
    if (result?.error) throw Error(result.detail || result.error);
    return result;
  });
}

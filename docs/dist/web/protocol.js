/** 另一方 */
export function opposite(s) {
    return s === 'wolf' ? 'sheep' : 'wolf';
}
/** 给界面看的中文 */
export function sideLabel(s) {
    return s === 'wolf' ? '狼' : '羊';
}
/** 第 moveCount 步之后该谁走（狼先走，所以偶数步后是狼） */
export function sideToMove(moveCount) {
    return moveCount % 2 === 0 ? 'wolf' : 'sheep';
}
/**
 * 悔棋要保留多少步（即退回到第 keep 步之后的局面）。
 * 目标：退回到"我该走"的局面，且至少退回一步。
 * 返回 -1 表示没得悔。
 */
export function undoKeepCount(moveCount, mine) {
    if (moveCount <= 0)
        return -1;
    let keep = moveCount - 1;
    if (sideToMove(keep) !== mine)
        keep--;
    return Math.max(0, keep);
}
/** 收到的局面是否比手上的新（用来丢掉乱序到达的旧消息） */
export function isFresher(next, cur) {
    if (next.round !== cur.round)
        return next.round > cur.round;
    return next.seq > cur.seq;
}
/** 请求的中文名，界面和弹窗共用 */
export function reqLabel(act) {
    if (act === 'swap')
        return '互换阵营';
    if (act === 'undo')
        return '悔棋';
    return '重开一局';
}
//# sourceMappingURL=protocol.js.map

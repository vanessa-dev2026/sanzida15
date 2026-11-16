import { NEIGHBORS, LEAP_TO, JUMPS, bits, bit, popcount, } from './board.js';
let mode = 'leap';
export function setCaptureMode(m) {
    mode = m;
}
export function getCaptureMode() {
    return mode;
}
export const WOLVES = 0;
export const SHEEP = 1;
function leapCapture(from, i, occ, sheep) {
    const mid = NEIGHBORS[from][i];
    const to = LEAP_TO[from][i];
    if (mid === undefined || to === undefined || to < 0)
        return -1;
    if (occ & bit(mid))
        return -1; // 中间必须为空：有狼或有羊都不行
    if (!(sheep & bit(to)))
        return -1; // 两格外必须是一只羊
    return to; // 落点就是羊的位置
}
/** 某只狼能否移动/吃子 */
export function wolfHasMove(w, wolves, sheep) {
    const occ = wolves | sheep;
    for (let i = 0; i < NEIGHBORS[w].length; i++) {
        const n = NEIGHBORS[w][i];
        if (!(occ & bit(n)))
            return true;
        if (mode === 'leap' && leapCapture(w, i, occ, sheep) >= 0)
            return true;
    }
    if (mode === 'jump') {
        for (const j of JUMPS[w]) {
            if ((sheep & bit(j.mid)) && !(occ & bit(j.to)))
                return true;
        }
    }
    return false;
}
export function wolfMoves(wolves, sheep) {
    const occ = wolves | sheep;
    const out = [];
    for (const from of bits(wolves)) {
        for (let i = 0; i < NEIGHBORS[from].length; i++) {
            const n = NEIGHBORS[from][i];
            if (!(occ & bit(n))) {
                out.push({ from, to: n, captured: -1 });
            }
            if (mode === 'leap') {
                const to = leapCapture(from, i, occ, sheep);
                if (to >= 0)
                    out.push({ from, to, captured: to });
            }
            if (mode === 'jump' && (sheep & bit(n))) {
                const j = JUMPS[from].find((x) => x.mid === n);
                if (j && !(occ & bit(j.to))) {
                    out.push({ from, to: j.to, captured: n });
                }
            }
        }
    }
    return out;
}
export function sheepMoves(wolves, sheep) {
    const out = [];
    const occ = wolves | sheep;
    for (const from of bits(sheep)) {
        for (const n of NEIGHBORS[from]) {
            if (!(occ & bit(n))) {
                out.push({ from, to: n, captured: -1 });
            }
        }
    }
    return out;
}
export function legalMoves(state) {
    return state.turn === WOLVES
        ? wolfMoves(state.wolves, state.sheep)
        : sheepMoves(state.wolves, state.sheep);
}
export function applyMove(state, move) {
    const fromBit = bit(move.from);
    const toBit = bit(move.to);
    let wolves = state.wolves;
    let sheep = state.sheep;
    if (state.turn === WOLVES) {
        // 吃子时 to 就是羊所在的格子：先把羊移除，再把狼放过去
        if (move.captured >= 0)
            sheep &= ~bit(move.captured);
        wolves = (wolves & ~fromBit) | toBit;
    }
    else {
        sheep = (sheep & ~fromBit) | toBit;
    }
    return { wolves, sheep, turn: state.turn === WOLVES ? SHEEP : WOLVES };
}
/** 被围死的狼（无任何合法走法） */
export function trappedWolves(wolves, sheep) {
    return bits(wolves).filter((w) => !wolfHasMove(w, wolves, sheep));
}
export function sheepCount(state) {
    return popcount(state.sheep);
}
//# sourceMappingURL=moves.js.map
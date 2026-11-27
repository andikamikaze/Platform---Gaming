/*
 * Number Link — logic puzzle (PRD v1.0 MVP)
 * Single-player. 30 level terverifikasi solvable (solution witness disertakan).
 * Jalankan: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "number-link",
    name: "Number Link",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Tarik garis dari setiap angka ke angka kembarannya. Gerak hanya atas/bawah/kiri/kanan, hindari kotak hitam dan garis lain. Sambungkan semua pasangan untuk menang!",
    bg: ["#818cf8", "#4f46e5"],
    bestKey: "numberLinkTotalStars",
};

/* ================= DATA LEVEL (terverifikasi solvable) =================
 * Format sesuai PRD §7: [row, col] zero-index. "solution" = witness valid,
 * dipakai untuk Petunjuk (FR-10) dan Lihat Solusi. */
const LEVELS = [
    { "id": 1, "size": 5, "difficulty": "easy", "blocked": [], "pairs": [{ "number": 1, "a": [0, 0], "b": [0, 2] }, { "number": 2, "a": [2, 0], "b": [4, 2] }], "solution": { "1": [[0, 0], [0, 1], [0, 2]], "2": [[2, 0], [3, 0], [4, 0], [4, 1], [4, 2]] }, "targetTimeSec": 45 },
    { "id": 2, "size": 5, "difficulty": "easy", "blocked": [[4, 1]], "pairs": [{ "number": 1, "a": [1, 3], "b": [0, 4] }, { "number": 2, "a": [3, 4], "b": [4, 3] }], "solution": { "1": [[1, 3], [0, 3], [0, 4]], "2": [[3, 4], [3, 3], [4, 3]] }, "targetTimeSec": 45 },
    { "id": 3, "size": 5, "difficulty": "easy", "blocked": [[0, 0]], "pairs": [{ "number": 1, "a": [3, 3], "b": [4, 2] }, { "number": 2, "a": [1, 2], "b": [1, 1] }, { "number": 3, "a": [1, 4], "b": [0, 2] }], "solution": { "1": [[3, 3], [4, 3], [4, 2]], "2": [[1, 2], [1, 1]], "3": [[1, 4], [0, 4], [0, 3], [0, 2]] }, "targetTimeSec": 50 },
    { "id": 4, "size": 5, "difficulty": "easy", "blocked": [[3, 0]], "pairs": [{ "number": 1, "a": [2, 0], "b": [3, 1] }, { "number": 2, "a": [1, 4], "b": [3, 4] }, { "number": 3, "a": [1, 3], "b": [4, 3] }], "solution": { "1": [[2, 0], [2, 1], [3, 1]], "2": [[1, 4], [2, 4], [3, 4]], "3": [[1, 3], [2, 3], [3, 3], [4, 3]] }, "targetTimeSec": 55 },
    { "id": 5, "size": 5, "difficulty": "easy", "blocked": [[1, 4], [3, 2]], "pairs": [{ "number": 1, "a": [4, 2], "b": [3, 4] }, { "number": 2, "a": [4, 0], "b": [3, 1] }, { "number": 3, "a": [0, 4], "b": [1, 3] }], "solution": { "1": [[4, 2], [4, 3], [4, 4], [3, 4]], "2": [[4, 0], [4, 1], [3, 1]], "3": [[0, 4], [0, 3], [1, 3]] }, "targetTimeSec": 55 },
    { "id": 6, "size": 5, "difficulty": "easy", "blocked": [[3, 4], [4, 4]], "pairs": [{ "number": 1, "a": [2, 4], "b": [0, 3] }, { "number": 2, "a": [2, 2], "b": [0, 2] }, { "number": 3, "a": [1, 1], "b": [3, 1] }], "solution": { "1": [[2, 4], [1, 4], [1, 3], [0, 3]], "2": [[2, 2], [1, 2], [0, 2]], "3": [[1, 1], [2, 1], [3, 1]] }, "targetTimeSec": 55 },
    { "id": 7, "size": 5, "difficulty": "easy", "blocked": [[0, 1], [2, 0]], "pairs": [{ "number": 1, "a": [4, 4], "b": [3, 3] }, { "number": 2, "a": [1, 2], "b": [0, 3] }, { "number": 3, "a": [2, 3], "b": [3, 4] }, { "number": 4, "a": [4, 0], "b": [2, 1] }], "solution": { "1": [[4, 4], [4, 3], [4, 2], [3, 2], [3, 3]], "2": [[1, 2], [1, 3], [1, 4], [0, 4], [0, 3]], "3": [[2, 3], [2, 4], [3, 4]], "4": [[4, 0], [3, 0], [3, 1], [2, 1]] }, "targetTimeSec": 75 },
    { "id": 8, "size": 5, "difficulty": "easy", "blocked": [[3, 2], [4, 1]], "pairs": [{ "number": 1, "a": [2, 2], "b": [2, 0] }, { "number": 2, "a": [3, 1], "b": [4, 0] }, { "number": 3, "a": [1, 3], "b": [4, 2] }, { "number": 4, "a": [0, 3], "b": [3, 4] }], "solution": { "1": [[2, 2], [2, 1], [2, 0]], "2": [[3, 1], [3, 0], [4, 0]], "3": [[1, 3], [2, 3], [3, 3], [4, 3], [4, 2]], "4": [[0, 3], [0, 4], [1, 4], [2, 4], [3, 4]] }, "targetTimeSec": 75 },
    { "id": 9, "size": 5, "difficulty": "easy", "blocked": [[0, 2], [3, 2]], "pairs": [{ "number": 1, "a": [1, 2], "b": [2, 1] }, { "number": 2, "a": [1, 0], "b": [0, 1] }, { "number": 3, "a": [0, 3], "b": [3, 4] }, { "number": 4, "a": [3, 1], "b": [2, 0] }], "solution": { "1": [[1, 2], [1, 3], [2, 3], [2, 2], [2, 1]], "2": [[1, 0], [0, 0], [0, 1]], "3": [[0, 3], [0, 4], [1, 4], [2, 4], [3, 4]], "4": [[3, 1], [3, 0], [2, 0]] }, "targetTimeSec": 75 },
    { "id": 10, "size": 5, "difficulty": "easy", "blocked": [[0, 0], [2, 1], [4, 3]], "pairs": [{ "number": 1, "a": [3, 3], "b": [0, 4] }, { "number": 2, "a": [4, 0], "b": [1, 0] }, { "number": 3, "a": [1, 3], "b": [0, 1] }, { "number": 4, "a": [1, 1], "b": [2, 2] }], "solution": { "1": [[3, 3], [3, 4], [2, 4], [1, 4], [0, 4]], "2": [[4, 0], [3, 0], [2, 0], [1, 0]], "3": [[1, 3], [0, 3], [0, 2], [0, 1]], "4": [[1, 1], [1, 2], [2, 2]] }, "targetTimeSec": 75 },
    { "id": 11, "size": 6, "difficulty": "medium", "blocked": [[2, 0], [3, 5]], "pairs": [{ "number": 1, "a": [4, 1], "b": [2, 2] }, { "number": 2, "a": [1, 4], "b": [2, 5] }, { "number": 3, "a": [4, 0], "b": [1, 1] }, { "number": 4, "a": [5, 1], "b": [3, 3] }, { "number": 5, "a": [2, 3], "b": [0, 3] }], "solution": { "1": [[4, 1], [4, 2], [3, 2], [2, 2]], "2": [[1, 4], [0, 4], [0, 5], [1, 5], [2, 5]], "3": [[4, 0], [3, 0], [3, 1], [2, 1], [1, 1]], "4": [[5, 1], [5, 2], [5, 3], [4, 3], [3, 3]], "5": [[2, 3], [1, 3], [1, 2], [0, 2], [0, 3]] }, "targetTimeSec": 125 },
    { "id": 12, "size": 6, "difficulty": "medium", "blocked": [[2, 5], [5, 0]], "pairs": [{ "number": 1, "a": [5, 1], "b": [3, 0] }, { "number": 2, "a": [3, 5], "b": [2, 1] }, { "number": 3, "a": [1, 4], "b": [0, 5] }, { "number": 4, "a": [2, 2], "b": [2, 4] }, { "number": 5, "a": [4, 4], "b": [5, 5] }], "solution": { "1": [[5, 1], [4, 1], [4, 0], [3, 0]], "2": [[3, 5], [3, 4], [3, 3], [3, 2], [3, 1], [2, 1]], "3": [[1, 4], [1, 5], [0, 5]], "4": [[2, 2], [1, 2], [1, 3], [2, 3], [2, 4]], "5": [[4, 4], [5, 4], [5, 5]] }, "targetTimeSec": 115 },
    { "id": 13, "size": 6, "difficulty": "medium", "blocked": [[4, 3], [4, 5]], "pairs": [{ "number": 1, "a": [4, 1], "b": [4, 4] }, { "number": 2, "a": [1, 5], "b": [3, 3] }, { "number": 3, "a": [0, 5], "b": [1, 2] }, { "number": 4, "a": [2, 2], "b": [5, 0] }, { "number": 5, "a": [2, 0], "b": [0, 1] }], "solution": { "1": [[4, 1], [5, 1], [5, 2], [5, 3], [5, 4], [4, 4]], "2": [[1, 5], [1, 4], [2, 4], [2, 3], [3, 3]], "3": [[0, 5], [0, 4], [0, 3], [1, 3], [1, 2]], "4": [[2, 2], [2, 1], [3, 1], [3, 0], [4, 0], [5, 0]], "5": [[2, 0], [1, 0], [1, 1], [0, 1]] }, "targetTimeSec": 135 },
    { "id": 14, "size": 6, "difficulty": "medium", "blocked": [[0, 0], [2, 2], [5, 0]], "pairs": [{ "number": 1, "a": [2, 0], "b": [1, 1] }, { "number": 2, "a": [4, 3], "b": [4, 0] }, { "number": 3, "a": [2, 4], "b": [5, 4] }, { "number": 4, "a": [1, 3], "b": [0, 1] }, { "number": 5, "a": [4, 4], "b": [4, 2] }, { "number": 6, "a": [0, 3], "b": [0, 5] }], "solution": { "1": [[2, 0], [3, 0], [3, 1], [2, 1], [1, 1]], "2": [[4, 3], [5, 3], [5, 2], [5, 1], [4, 1], [4, 0]], "3": [[2, 4], [2, 5], [3, 5], [4, 5], [5, 5], [5, 4]], "4": [[1, 3], [1, 2], [0, 2], [0, 1]], "5": [[4, 4], [3, 4], [3, 3], [3, 2], [4, 2]], "6": [[0, 3], [0, 4], [1, 4], [1, 5], [0, 5]] }, "targetTimeSec": 155 },
    { "id": 15, "size": 6, "difficulty": "medium", "blocked": [[3, 0], [5, 0], [5, 3]], "pairs": [{ "number": 1, "a": [4, 3], "b": [5, 4] }, { "number": 2, "a": [4, 0], "b": [2, 2] }, { "number": 3, "a": [1, 4], "b": [0, 5] }, { "number": 4, "a": [2, 3], "b": [0, 3] }, { "number": 5, "a": [2, 1], "b": [1, 0] }, { "number": 6, "a": [2, 4], "b": [4, 5] }], "solution": { "1": [[4, 3], [3, 3], [3, 4], [4, 4], [5, 4]], "2": [[4, 0], [4, 1], [3, 1], [3, 2], [2, 2]], "3": [[1, 4], [0, 4], [0, 5]], "4": [[2, 3], [1, 3], [1, 2], [0, 2], [0, 3]], "5": [[2, 1], [1, 1], [0, 1], [0, 0], [1, 0]], "6": [[2, 4], [2, 5], [3, 5], [4, 5]] }, "targetTimeSec": 140 },
    { "id": 16, "size": 6, "difficulty": "medium", "blocked": [[0, 1], [4, 0], [5, 1]], "pairs": [{ "number": 1, "a": [4, 5], "b": [2, 4] }, { "number": 2, "a": [4, 2], "b": [5, 5] }, { "number": 3, "a": [3, 2], "b": [1, 4] }, { "number": 4, "a": [0, 5], "b": [3, 5] }, { "number": 5, "a": [0, 2], "b": [1, 0] }, { "number": 6, "a": [2, 0], "b": [4, 1] }], "solution": { "1": [[4, 5], [4, 4], [3, 4], [2, 4]], "2": [[4, 2], [4, 3], [5, 3], [5, 4], [5, 5]], "3": [[3, 2], [3, 3], [2, 3], [1, 3], [1, 4]], "4": [[0, 5], [1, 5], [2, 5], [3, 5]], "5": [[0, 2], [1, 2], [2, 2], [2, 1], [1, 1], [1, 0]], "6": [[2, 0], [3, 0], [3, 1], [4, 1]] }, "targetTimeSec": 140 },
    { "id": 17, "size": 6, "difficulty": "medium", "blocked": [[0, 0], [2, 1], [5, 1]], "pairs": [{ "number": 1, "a": [3, 4], "b": [5, 5] }, { "number": 2, "a": [4, 5], "b": [3, 3] }, { "number": 3, "a": [5, 3], "b": [2, 2] }, { "number": 4, "a": [1, 4], "b": [1, 1] }, { "number": 5, "a": [4, 1], "b": [1, 0] }, { "number": 6, "a": [1, 5], "b": [0, 3] }], "solution": { "1": [[3, 4], [4, 4], [5, 4], [5, 5]], "2": [[4, 5], [3, 5], [2, 5], [2, 4], [2, 3], [3, 3]], "3": [[5, 3], [5, 2], [4, 2], [3, 2], [2, 2]], "4": [[1, 4], [1, 3], [1, 2], [0, 2], [0, 1], [1, 1]], "5": [[4, 1], [4, 0], [3, 0], [2, 0], [1, 0]], "6": [[1, 5], [0, 5], [0, 4], [0, 3]] }, "targetTimeSec": 150 },
    { "id": 18, "size": 6, "difficulty": "medium", "blocked": [[0, 5], [1, 1], [1, 2]], "pairs": [{ "number": 1, "a": [0, 3], "b": [1, 0] }, { "number": 2, "a": [2, 1], "b": [5, 0] }, { "number": 3, "a": [4, 5], "b": [3, 2] }, { "number": 4, "a": [2, 4], "b": [1, 5] }, { "number": 5, "a": [2, 3], "b": [0, 4] }, { "number": 6, "a": [4, 2], "b": [5, 5] }, { "number": 7, "a": [4, 1], "b": [5, 3] }], "solution": { "1": [[0, 3], [0, 2], [0, 1], [0, 0], [1, 0]], "2": [[2, 1], [3, 1], [3, 0], [4, 0], [5, 0]], "3": [[4, 5], [3, 5], [3, 4], [3, 3], [3, 2]], "4": [[2, 4], [2, 5], [1, 5]], "5": [[2, 3], [1, 3], [1, 4], [0, 4]], "6": [[4, 2], [4, 3], [4, 4], [5, 4], [5, 5]], "7": [[4, 1], [5, 1], [5, 2], [5, 3]] }, "targetTimeSec": 155 },
    { "id": 19, "size": 6, "difficulty": "medium", "blocked": [[2, 5], [3, 2], [5, 3]], "pairs": [{ "number": 1, "a": [3, 3], "b": [4, 5] }, { "number": 2, "a": [4, 2], "b": [5, 5] }, { "number": 3, "a": [0, 5], "b": [2, 3] }, { "number": 4, "a": [5, 2], "b": [3, 1] }, { "number": 5, "a": [5, 0], "b": [2, 0] }, { "number": 6, "a": [1, 0], "b": [2, 2] }, { "number": 7, "a": [0, 0], "b": [0, 3] }], "solution": { "1": [[3, 3], [3, 4], [3, 5], [4, 5]], "2": [[4, 2], [4, 3], [4, 4], [5, 4], [5, 5]], "3": [[0, 5], [0, 4], [1, 4], [1, 3], [2, 3]], "4": [[5, 2], [5, 1], [4, 1], [3, 1]], "5": [[5, 0], [4, 0], [3, 0], [2, 0]], "6": [[1, 0], [1, 1], [2, 1], [2, 2]], "7": [[0, 0], [0, 1], [0, 2], [0, 3]] }, "targetTimeSec": 150 },
    { "id": 20, "size": 6, "difficulty": "medium", "blocked": [[2, 0], [4, 1], [5, 2]], "pairs": [{ "number": 1, "a": [2, 2], "b": [0, 0] }, { "number": 2, "a": [1, 4], "b": [0, 1] }, { "number": 3, "a": [5, 1], "b": [3, 0] }, { "number": 4, "a": [3, 5], "b": [5, 3] }, { "number": 5, "a": [2, 5], "b": [3, 3] }, { "number": 6, "a": [4, 3], "b": [3, 1] }, { "number": 7, "a": [0, 3], "b": [1, 5] }], "solution": { "1": [[2, 2], [2, 1], [1, 1], [1, 0], [0, 0]], "2": [[1, 4], [1, 3], [1, 2], [0, 2], [0, 1]], "3": [[5, 1], [5, 0], [4, 0], [3, 0]], "4": [[3, 5], [4, 5], [5, 5], [5, 4], [5, 3]], "5": [[2, 5], [2, 4], [3, 4], [3, 3]], "6": [[4, 3], [4, 2], [3, 2], [3, 1]], "7": [[0, 3], [0, 4], [0, 5], [1, 5]] }, "targetTimeSec": 155 },
    { "id": 21, "size": 7, "difficulty": "hard", "blocked": [[1, 6], [2, 6], [3, 3]], "pairs": [{ "number": 1, "a": [4, 1], "b": [2, 0] }, { "number": 2, "a": [5, 0], "b": [4, 3] }, { "number": 3, "a": [6, 6], "b": [3, 4] }, { "number": 4, "a": [1, 2], "b": [1, 5] }, { "number": 5, "a": [3, 6], "b": [4, 2] }, { "number": 6, "a": [0, 0], "b": [2, 1] }], "solution": { "1": [[4, 1], [3, 1], [3, 0], [2, 0]], "2": [[5, 0], [5, 1], [5, 2], [5, 3], [4, 3]], "3": [[6, 6], [5, 6], [5, 5], [6, 5], [6, 4], [5, 4], [4, 4], [3, 4]], "4": [[1, 2], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5]], "5": [[3, 6], [3, 5], [2, 5], [2, 4], [2, 3], [2, 2], [3, 2], [4, 2]], "6": [[0, 0], [0, 1], [1, 1], [2, 1]] }, "targetTimeSec": 190 },
    { "id": 22, "size": 7, "difficulty": "hard", "blocked": [[1, 1], [1, 2], [4, 5]], "pairs": [{ "number": 1, "a": [1, 4], "b": [3, 3] }, { "number": 2, "a": [2, 4], "b": [5, 0] }, { "number": 3, "a": [1, 5], "b": [6, 5] }, { "number": 4, "a": [0, 2], "b": [3, 1] }, { "number": 5, "a": [6, 1], "b": [6, 4] }, { "number": 6, "a": [2, 6], "b": [0, 5] }], "solution": { "1": [[1, 4], [0, 4], [0, 3], [1, 3], [2, 3], [3, 3]], "2": [[2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [5, 2], [5, 1], [5, 0]], "3": [[1, 5], [2, 5], [3, 5], [3, 6], [4, 6], [5, 6], [5, 5], [6, 5]], "4": [[0, 2], [0, 1], [0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], "5": [[6, 1], [6, 2], [6, 3], [5, 3], [5, 4], [6, 4]], "6": [[2, 6], [1, 6], [0, 6], [0, 5]] }, "targetTimeSec": 210 },
    { "id": 23, "size": 7, "difficulty": "hard", "blocked": [[1, 5], [2, 5], [4, 5]], "pairs": [{ "number": 1, "a": [3, 1], "b": [6, 0] }, { "number": 2, "a": [0, 6], "b": [0, 1] }, { "number": 3, "a": [1, 0], "b": [2, 2] }, { "number": 4, "a": [4, 4], "b": [6, 1] }, { "number": 5, "a": [2, 4], "b": [4, 2] }, { "number": 6, "a": [2, 6], "b": [3, 4] }, { "number": 7, "a": [6, 2], "b": [4, 6] }], "solution": { "1": [[3, 1], [4, 1], [4, 0], [5, 0], [6, 0]], "2": [[0, 6], [0, 5], [0, 4], [0, 3], [0, 2], [0, 1]], "3": [[1, 0], [2, 0], [2, 1], [2, 2]], "4": [[4, 4], [5, 4], [5, 3], [5, 2], [5, 1], [6, 1]], "5": [[2, 4], [1, 4], [1, 3], [2, 3], [3, 3], [4, 3], [4, 2]], "6": [[2, 6], [3, 6], [3, 5], [3, 4]], "7": [[6, 2], [6, 3], [6, 4], [6, 5], [5, 5], [5, 6], [4, 6]] }, "targetTimeSec": 210 },
    { "id": 24, "size": 7, "difficulty": "hard", "blocked": [[1, 4], [3, 6], [5, 6]], "pairs": [{ "number": 1, "a": [5, 1], "b": [6, 6] }, { "number": 2, "a": [1, 2], "b": [2, 0] }, { "number": 3, "a": [5, 4], "b": [4, 6] }, { "number": 4, "a": [0, 2], "b": [1, 5] }, { "number": 5, "a": [4, 2], "b": [2, 4] }, { "number": 6, "a": [1, 3], "b": [2, 1] }, { "number": 7, "a": [6, 0], "b": [3, 0] }], "solution": { "1": [[5, 1], [5, 2], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6]], "2": [[1, 2], [1, 1], [0, 1], [0, 0], [1, 0], [2, 0]], "3": [[5, 4], [5, 3], [4, 3], [4, 4], [4, 5], [4, 6]], "4": [[0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 6], [1, 5]], "5": [[4, 2], [4, 1], [3, 1], [3, 2], [3, 3], [3, 4], [2, 4]], "6": [[1, 3], [2, 3], [2, 2], [2, 1]], "7": [[6, 0], [5, 0], [4, 0], [3, 0]] }, "targetTimeSec": 220 },
    { "id": 25, "size": 7, "difficulty": "hard", "blocked": [[0, 5], [4, 0], [5, 0], [6, 2]], "pairs": [{ "number": 1, "a": [6, 0], "b": [6, 4] }, { "number": 2, "a": [4, 2], "b": [1, 5] }, { "number": 3, "a": [4, 3], "b": [6, 5] }, { "number": 4, "a": [0, 4], "b": [2, 3] }, { "number": 5, "a": [1, 2], "b": [3, 0] }, { "number": 6, "a": [6, 6], "b": [2, 6] }, { "number": 7, "a": [2, 2], "b": [4, 1] }], "solution": { "1": [[6, 0], [6, 1], [5, 1], [5, 2], [5, 3], [6, 3], [6, 4]], "2": [[4, 2], [3, 2], [3, 3], [3, 4], [2, 4], [1, 4], [1, 5]], "3": [[4, 3], [4, 4], [5, 4], [5, 5], [6, 5]], "4": [[0, 4], [0, 3], [1, 3], [2, 3]], "5": [[1, 2], [1, 1], [0, 1], [0, 0], [1, 0], [2, 0], [3, 0]], "6": [[6, 6], [5, 6], [4, 6], [3, 6], [3, 5], [2, 5], [2, 6]], "7": [[2, 2], [2, 1], [3, 1], [4, 1]] }, "targetTimeSec": 220 },
    { "id": 26, "size": 7, "difficulty": "hard", "blocked": [[1, 0], [2, 3], [3, 2], [6, 4]], "pairs": [{ "number": 1, "a": [0, 4], "b": [2, 1] }, { "number": 2, "a": [2, 0], "b": [4, 3] }, { "number": 3, "a": [5, 4], "b": [6, 6] }, { "number": 4, "a": [0, 6], "b": [3, 4] }, { "number": 5, "a": [3, 5], "b": [5, 6] }, { "number": 6, "a": [5, 2], "b": [4, 0] }, { "number": 7, "a": [6, 3], "b": [6, 0] }], "solution": { "1": [[0, 4], [1, 4], [1, 3], [1, 2], [2, 2], [2, 1]], "2": [[2, 0], [3, 0], [3, 1], [4, 1], [4, 2], [4, 3]], "3": [[5, 4], [5, 5], [6, 5], [6, 6]], "4": [[0, 6], [1, 6], [2, 6], [2, 5], [2, 4], [3, 4]], "5": [[3, 5], [3, 6], [4, 6], [5, 6]], "6": [[5, 2], [5, 1], [5, 0], [4, 0]], "7": [[6, 3], [6, 2], [6, 1], [6, 0]] }, "targetTimeSec": 190 },
    { "id": 27, "size": 7, "difficulty": "hard", "blocked": [[0, 0], [0, 3], [3, 2], [4, 6]], "pairs": [{ "number": 1, "a": [2, 3], "b": [0, 4] }, { "number": 2, "a": [4, 0], "b": [1, 0] }, { "number": 3, "a": [1, 6], "b": [3, 3] }, { "number": 4, "a": [3, 6], "b": [5, 5] }, { "number": 5, "a": [6, 1], "b": [4, 1] }, { "number": 6, "a": [6, 3], "b": [4, 2] }, { "number": 7, "a": [0, 6], "b": [1, 5] }, { "number": 8, "a": [4, 4], "b": [6, 6] }], "solution": { "1": [[2, 3], [2, 2], [1, 2], [1, 3], [1, 4], [0, 4]], "2": [[4, 0], [3, 0], [3, 1], [2, 1], [2, 0], [1, 0]], "3": [[1, 6], [2, 6], [2, 5], [2, 4], [3, 4], [3, 3]], "4": [[3, 6], [3, 5], [4, 5], [5, 5]], "5": [[6, 1], [6, 0], [5, 0], [5, 1], [4, 1]], "6": [[6, 3], [5, 3], [5, 2], [4, 2]], "7": [[0, 6], [0, 5], [1, 5]], "8": [[4, 4], [5, 4], [6, 4], [6, 5], [6, 6]] }, "targetTimeSec": 210 },
    { "id": 28, "size": 7, "difficulty": "hard", "blocked": [[0, 0], [0, 6], [1, 0], [6, 2]], "pairs": [{ "number": 1, "a": [1, 3], "b": [3, 2] }, { "number": 2, "a": [4, 5], "b": [1, 5] }, { "number": 3, "a": [5, 2], "b": [3, 1] }, { "number": 4, "a": [5, 4], "b": [3, 5] }, { "number": 5, "a": [5, 1], "b": [3, 0] }, { "number": 6, "a": [0, 3], "b": [2, 0] }, { "number": 7, "a": [6, 3], "b": [5, 5] }, { "number": 8, "a": [2, 5], "b": [0, 4] }], "solution": { "1": [[1, 3], [1, 2], [2, 2], [3, 2]], "2": [[4, 5], [4, 6], [3, 6], [2, 6], [1, 6], [1, 5]], "3": [[5, 2], [4, 2], [4, 1], [3, 1]], "4": [[5, 4], [5, 3], [4, 3], [3, 3], [3, 4], [3, 5]], "5": [[5, 1], [6, 1], [6, 0], [5, 0], [4, 0], [3, 0]], "6": [[0, 3], [0, 2], [0, 1], [1, 1], [2, 1], [2, 0]], "7": [[6, 3], [6, 4], [6, 5], [6, 6], [5, 6], [5, 5]], "8": [[2, 5], [2, 4], [1, 4], [0, 4]] }, "targetTimeSec": 225 },
    { "id": 29, "size": 7, "difficulty": "hard", "blocked": [[0, 0], [0, 1], [5, 2], [5, 3]], "pairs": [{ "number": 1, "a": [4, 0], "b": [1, 1] }, { "number": 2, "a": [3, 2], "b": [0, 2] }, { "number": 3, "a": [2, 4], "b": [3, 6] }, { "number": 4, "a": [6, 2], "b": [6, 6] }, { "number": 5, "a": [1, 3], "b": [5, 4] }, { "number": 6, "a": [5, 0], "b": [4, 2] }, { "number": 7, "a": [3, 4], "b": [4, 6] }, { "number": 8, "a": [0, 6], "b": [1, 4] }], "solution": { "1": [[4, 0], [3, 0], [2, 0], [1, 0], [1, 1]], "2": [[3, 2], [3, 1], [2, 1], [2, 2], [1, 2], [0, 2]], "3": [[2, 4], [2, 5], [1, 5], [1, 6], [2, 6], [3, 6]], "4": [[6, 2], [6, 3], [6, 4], [6, 5], [6, 6]], "5": [[1, 3], [2, 3], [3, 3], [4, 3], [4, 4], [5, 4]], "6": [[5, 0], [6, 0], [6, 1], [5, 1], [4, 1], [4, 2]], "7": [[3, 4], [3, 5], [4, 5], [4, 6]], "8": [[0, 6], [0, 5], [0, 4], [1, 4]] }, "targetTimeSec": 225 },
    { "id": 30, "size": 7, "difficulty": "hard", "blocked": [[0, 5], [0, 6], [3, 1], [6, 2]], "pairs": [{ "number": 1, "a": [6, 3], "b": [6, 6] }, { "number": 2, "a": [3, 0], "b": [6, 1] }, { "number": 3, "a": [2, 5], "b": [1, 2] }, { "number": 4, "a": [3, 4], "b": [5, 1] }, { "number": 5, "a": [0, 2], "b": [1, 6] }, { "number": 6, "a": [5, 6], "b": [2, 6] }, { "number": 7, "a": [4, 1], "b": [2, 0] }, { "number": 8, "a": [3, 5], "b": [5, 4] }], "solution": { "1": [[6, 3], [6, 4], [6, 5], [6, 6]], "2": [[3, 0], [4, 0], [5, 0], [6, 0], [6, 1]], "3": [[2, 5], [2, 4], [2, 3], [1, 3], [1, 2]], "4": [[3, 4], [3, 3], [4, 3], [5, 3], [5, 2], [5, 1]], "5": [[0, 2], [0, 3], [0, 4], [1, 4], [1, 5], [1, 6]], "6": [[5, 6], [4, 6], [3, 6], [2, 6]], "7": [[4, 1], [4, 2], [3, 2], [2, 2], [2, 1], [2, 0]], "8": [[3, 5], [4, 5], [4, 4], [5, 4]] }, "targetTimeSec": 215 },
];

/* ================= VALIDATOR (PRD §7, build-time) =================
 * Memeriksa witness solusi ke-30 level tanpa DOM. Dipanggil sekali lewat:
 *   node -e 'import("./Gaming/number-link.js").then(m=>console.log(m._test()))'
 */
export function _test() {
    const errors = [];
    const k = (c) => c[0] + "," + c[1];
    const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];
    if (!Array.isArray(LEVELS) || LEVELS.length !== 30) {
        errors.push(`Expected 30 levels, got ${LEVELS?.length ?? 0}`);
    }
    for (const l of LEVELS) {
        const tag = `level ${l.id}`;
        const blocked = new Set((l.blocked || []).map(k));
        const used = new Map(); // "row,col" -> nomor pasangan
        const pairs = l.pairs || [];
        const nums = new Set(pairs.map((p) => p.number));
        const sol = l.solution || {};

        for (const n of nums) if (!sol[String(n)]) errors.push(`${tag}: missing solution for pair ${n}`);
        for (const key of Object.keys(sol)) {
            if (!nums.has(Number(key))) errors.push(`${tag}: solution for unknown pair ${key}`);
        }

        for (const p of pairs) {
            const path = sol[String(p.number)];
            if (!Array.isArray(path) || path.length < 2) {
                errors.push(`${tag}: pair ${p.number} has no valid path`);
                continue;
            }
            for (let i = 0; i < path.length; i++) {
                const c = path[i];
                if (!Array.isArray(c) || c.length !== 2 || !Number.isInteger(c[0]) || !Number.isInteger(c[1])) {
                    errors.push(`${tag}: pair ${p.number} has invalid coordinate at index ${i}`);
                    continue;
                }
                if (c[0] < 0 || c[1] < 0 || c[0] >= l.size || c[1] >= l.size) {
                    errors.push(`${tag}: pair ${p.number} leaves grid at ${k(c)}`);
                }
                if (blocked.has(k(c))) errors.push(`${tag}: pair ${p.number} enters blocked cell ${k(c)}`);
                if (i > 0) {
                    const d = Math.abs(c[0] - path[i - 1][0]) + Math.abs(c[1] - path[i - 1][1]);
                    if (d !== 1) errors.push(`${tag}: pair ${p.number} non-orthogonal step ${k(path[i - 1])} -> ${k(c)}`);
                }
                if (used.has(k(c))) errors.push(`${tag}: cell ${k(c)} shared by pairs ${used.get(k(c))} and ${p.number}`);
                else used.set(k(c), p.number);
            }
            const first = path[0], last = path[path.length - 1];
            const endpointsOk = (sameCell(first, p.a) && sameCell(last, p.b)) || (sameCell(first, p.b) && sameCell(last, p.a));
            if (!endpointsOk) errors.push(`${tag}: pair ${p.number} endpoints are not its a/b pair`);
        }
    }
    return { ok: errors.length === 0, errors };
}

const PALETTE = {
    dark: ["#f87171", "#fbbf24", "#4ade80", "#60a5fa", "#c084fc", "#f472b6", "#2dd4bf", "#fb923c"],
    light: ["#dc2626", "#d97706", "#16a34a", "#2563eb", "#9333ea", "#db2777", "#0d9488", "#ea580c"],
};
const TIER = {
    easy: { label: "Mudah", cls: "nl-tier-easy" },
    medium: { label: "Sedang", cls: "nl-tier-medium" },
    hard: { label: "Sulit", cls: "nl-tier-hard" },
};
const STORE_PROGRESS = "numberLinkProgress_v1";
const STORE_SETTINGS = "numberLinkSettings_v1";

/* ============================= MOUNT ============================= */
export function mount(root, context = {}) {
    // PRD §1.2: multiplayer = non-goal. Mode room diabaikan; game selalu lokal.
    const { playerName = "Player", onExit = () => { } } = context;

    /* ---------- penyimpanan lokal (FR-9) ---------- */
    const load = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };
    const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
    let progress = load(STORE_PROGRESS, { levels: {}, tutorialSeen: false });
    if (!progress.levels) progress.levels = {};
    let settings = load(STORE_SETTINGS, { sound: true, haptics: true, theme: "dark" });

    /* ---------- bantuan internal sekali per game ---------- */
    const HELP_FLAG = "numberLinkHelpSeen";
    let seenHelp = true;
    try { seenHelp = localStorage.getItem(HELP_FLAG) === "1"; } catch (_) { seenHelp = true; }
    let helpOpen = !seenHelp;
    if (!seenHelp) { try { localStorage.setItem(HELP_FLAG, "1"); } catch (_) { /* storage blocked */ } }
    let cheatsOpen = false;

    const starsOf = (id) => progress.levels[id]?.stars || 0;
    const totalStars = () => LEVELS.reduce((s, l) => s + starsOf(l.id), 0);
    const isUnlocked = (i) => i === 0 || starsOf(LEVELS[i - 1].id) > 0;
    const continueIndex = () => { const i = LEVELS.findIndex((l) => !starsOf(l.id)); return i < 0 ? LEVELS.length - 1 : i; };

    /* ---------- audio & haptic (P1) ---------- */
    let actx = null;
    function audio() {
        if (!settings.sound) return null;
        if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
        if (actx.state === "suspended") actx.resume().catch(() => { });
        return actx;
    }
    function tone(freq, dur = 0.08, type = "sine", vol = 0.12, delay = 0) {
        const ctx = audio(); if (!ctx) return;
        const t = ctx.currentTime + delay;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + dur + 0.05);
    }
    const snd = {
        click: () => tone(600, 0.04, "triangle", 0.05),
        step: () => tone(340, 0.03, "triangle", 0.035),
        connect: () => { tone(523, 0.09, "sine", 0.12); tone(784, 0.14, "sine", 0.12, 0.07); },
        error: () => tone(130, 0.12, "square", 0.07),
        hint: () => tone(880, 0.12, "sine", 0.1),
        win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "sine", 0.13, i * 0.1)),
    };
    const buzz = (p) => { if (settings.haptics && navigator.vibrate) { try { navigator.vibrate(p); } catch { } } };

    /* ---------- state game ---------- */
    const S = {
        screen: "home",            // home | levels | game
        li: 0,                     // index level aktif
        size: 5, blocked: new Set(), pairs: [], ends: {},
        paths: {},                 // { nomor: [[r,c],...] }  (FR: path model)
        history: [],               // stack undo (FR-8)
        moves: 0, hints: 0, resets: 0,
        activeNum: null, dragging: false, pointerId: null, pre: null,
        startAt: 0, elapsedFinal: null, paused: false, pauseStartedAt: 0,
        won: false, solutionShown: false, cheated: false, overlay: null, confirmReset: false,
        win: null, lastErr: 0, lastStep: 0,
    };
    const resetsByLevel = {};
    const timeouts = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms); timeouts.add(t); };

    const key = (c) => c[0] + "," + c[1];
    const same = (a, b) => a[0] === b[0] && a[1] === b[1];
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const color = (n) => PALETTE[settings.theme === "light" ? "light" : "dark"][(n - 1) % 8];
    const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    // Waktu dibekukan saat jeda; startAt digeser saat lanjut (lihat togglePause).
    const elapsed = () => S.elapsedFinal ?? ((S.paused && S.pauseStartedAt ? S.pauseStartedAt : performance.now()) - S.startAt) / 1000;
    const level = () => LEVELS[S.li];

    function endpointAt(c) {
        for (const p of S.pairs) {
            if (same(p.a, c) || same(p.b, c)) return p;
        }
        return null;
    }
    function ownerAt(c, exceptN) {
        for (const n of Object.keys(S.paths)) {
            if (+n === exceptN) continue;
            if (S.paths[n].some((x) => same(x, c))) return +n;
        }
        return null;
    }
    const idxOf = (path, c) => path.findIndex((x) => same(x, c));
    function isComplete(n) {
        const p = S.paths[n]; if (!p || p.length < 2) return false;
        const e = S.ends[n];
        return (same(p[0], e.a) && same(p[p.length - 1], e.b)) || (same(p[0], e.b) && same(p[p.length - 1], e.a));
    }
    const linkedCount = () => S.pairs.filter((p) => isComplete(p.number)).length;
    function snap() {
        const p = {}; Object.keys(S.paths).map(Number).sort((a, b) => a - b).forEach((n) => (p[n] = S.paths[n]));
        return JSON.stringify({ p, m: S.moves });
    }
    function pushHistory(pre) { if (snap() !== pre.str) { S.history.push(pre); if (S.history.length > 120) S.history.shift(); } }
    // Potong path lain saat ditimpa (FR-5: "drawing over removes the old path")
    function cutPath(n, c) {
        const p = S.paths[n]; const i = idxOf(p, c); if (i < 0) return;
        if (i <= 0) delete S.paths[n];
        else { p.length = i; if (p.length < 2) delete S.paths[n]; }
    }

    /* ---------- shell HTML + CSS (scoped, tema gelap/terang) ---------- */
    root.innerHTML = `
<style>
.nl-app{--bg:#0b1220;--panel:#111a2e;--cell:#1a2440;--grid:#3b4a6b;--text:#e8edf7;--mut:#93a1bd;--line:#26324e;--disc:#0b1220;--block:#05070d;--blockline:#31405f;--accent:#6366f1;
  position:relative;background:var(--bg);color:var(--text);border-radius:18px;padding:14px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;}
.nl-app.nl-light{--bg:#f2f5fb;--panel:#ffffff;--cell:#ffffff;--grid:#b6c0d4;--text:#101828;--mut:#5b6779;--line:#e3e8f2;--disc:#ffffff;--block:#0b0f19;--blockline:#0b0f19;}
.nl-panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:12px;}
.nl-btn{appearance:none;border:0;border-radius:12px;background:var(--accent);color:#fff;font-weight:700;font-size:.9rem;padding:11px 16px;min-height:44px;cursor:pointer;transition:transform .08s,filter .15s;}
.nl-btn:hover{filter:brightness(1.1);} .nl-btn:active{transform:scale(.96);}
.nl-btn:disabled{opacity:.4;cursor:default;transform:none;}
.nl-btn.nl-ghost{background:transparent;color:var(--text);border:1px solid var(--line);}
.nl-btn.nl-warn{background:#dc2626;}
.nl-icon-btn{appearance:none;border:1px solid var(--line);background:transparent;color:var(--text);border-radius:10px;width:44px;height:44px;font-size:1.05rem;cursor:pointer;flex:none;}
.nl-icon-btn:active{transform:scale(.94);}
/* Home */
.nl-home{display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 8px;text-align:center;}
.nl-home-logo{width:84px;height:84px;}
.nl-home h3{margin:0;font-size:1.5rem;letter-spacing:.5px;}
.nl-home .nl-sub{color:var(--mut);font-size:.85rem;margin:0;}
.nl-home-stars{font-size:.95rem;color:#fbbf24;font-weight:700;}
.nl-home-btns{display:flex;flex-direction:column;gap:10px;width:min(100%,280px);}
/* Level select */
.nl-lv-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.nl-lv-head h3{margin:0;flex:1;font-size:1rem;}
.nl-tier-title{font-size:.78rem;font-weight:800;letter-spacing:.8px;text-transform:uppercase;margin:12px 2px 6px;display:flex;align-items:center;gap:8px;}
.nl-tier-title::after{content:"";flex:1;height:1px;background:var(--line);}
.nl-tier-easy{color:#22c55e;} .nl-tier-medium{color:#f59e0b;} .nl-tier-hard{color:#ef4444;}
.nl-tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}
.nl-tile{appearance:none;border:1px solid var(--line);background:var(--cell);color:var(--text);border-radius:12px;min-height:56px;padding:6px 2px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}
.nl-tile:not(:disabled):hover{border-color:var(--accent);}
.nl-tile:disabled{opacity:.4;cursor:default;}
.nl-tile-num{font-weight:800;font-size:1.05rem;line-height:1;}
.nl-tile-stars{font-size:.6rem;letter-spacing:1px;color:#fbbf24;}
.nl-tile-stars .off{color:var(--grid);}
.nl-tile.nl-done{border-color:#fbbf2466;}
/* Game */
.nl-chip{font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.6px;border-radius:999px;padding:3px 9px;border:1px solid currentColor;}
@keyframes nl-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}50%{transform:translateX(5px)}75%{transform:translateX(-3px)}}
svg.nl-board{display:block;width:100%;height:auto;touch-action:none;cursor:pointer;}
svg.nl-board .nl-cell{fill:var(--cell);stroke:var(--grid);stroke-width:2;stroke-dasharray:1 7;stroke-linecap:round;}
svg.nl-board .nl-blocked{fill:var(--block);stroke:var(--blockline);stroke-dasharray:none;}
svg.nl-board .nl-path{fill:none;stroke-width:30;stroke-linecap:round;stroke-linejoin:round;opacity:.8;transition:opacity .12s;}
svg.nl-board .nl-path.nl-active{stroke-width:34;opacity:1;}
svg.nl-board .nl-end circle{fill-opacity:.16;transition:fill-opacity .18s;}
svg.nl-board .nl-end text{font-size:46px;font-weight:800;text-anchor:middle;dominant-baseline:central;pointer-events:none;}
svg.nl-board .nl-end.nl-done circle{fill-opacity:1;}
svg.nl-board .nl-end.nl-done text{fill:var(--disc);}
svg.nl-board .nl-end.nl-target circle{animation:nl-pulse 1s ease-in-out infinite;}
@keyframes nl-pulse{0%,100%{fill-opacity:.16}50%{fill-opacity:.45}}
svg.nl-board .nl-flash{fill:#ef4444;opacity:.55;animation:nl-fade .3s forwards;pointer-events:none;}
@keyframes nl-fade{to{opacity:0}}
.nl-controls{display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap;}
.nl-controls .nl-btn{flex:1;min-width:96px;max-width:160px;}
.nl-linkbtn{appearance:none;background:none;border:none;color:var(--mut);font-size:.78rem;text-decoration:underline;cursor:pointer;padding:8px;min-height:44px;}
.nl-sol-banner{margin-top:10px;border:1px dashed var(--grid);border-radius:12px;padding:10px;font-size:.8rem;color:var(--mut);display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;text-align:center;}
/* Overlay & modal */
.nl-overlay{position:absolute;inset:0;z-index:40;background:rgba(4,8,18,.62);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;border-radius:18px;padding:16px;}
.nl-overlay[hidden]{display:none;}
.nl-modal{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:22px;width:min(100%,340px);max-height:90%;overflow:auto;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.45);}
.nl-modal h3{margin:6px 0 4px;font-size:1.25rem;}
.nl-modal .nl-sub{color:var(--mut);font-size:.83rem;margin:0 0 12px;}
.nl-stars-big{font-size:2.5rem;letter-spacing:6px;line-height:1;margin:4px 0 2px;}
.nl-stars-big span{display:inline-block;color:var(--grid);}
.nl-stars-big span.on{color:#fbbf24;animation:nl-pop .45s backwards;}
.nl-stars-big span.on:nth-child(2){animation-delay:.15s;}
.nl-stars-big span.on:nth-child(3){animation-delay:.3s;}
@keyframes nl-pop{0%{transform:scale(.2);opacity:0}60%{transform:scale(1.25)}100%{transform:scale(1);opacity:1}}
.nl-win-stats{display:flex;justify-content:center;gap:18px;margin:12px 0;font-size:.8rem;color:var(--mut);}
.nl-win-stats b{display:block;font-size:1.05rem;color:var(--text);}
.nl-modal-btns{display:flex;flex-direction:column;gap:8px;margin-top:12px;}
.nl-tut-list{text-align:left;font-size:.85rem;color:var(--text);display:flex;flex-direction:column;gap:10px;margin:12px 0;}
.nl-tut-list div{display:flex;gap:10px;align-items:flex-start;}
.nl-tut-list .ic{flex:none;width:30px;height:30px;border-radius:8px;background:var(--cell);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:1rem;}
.nl-set-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 2px;border-bottom:1px solid var(--line);font-size:.9rem;}
.nl-set-row:last-of-type{border-bottom:0;}
.nl-switch{appearance:none;border:1px solid var(--line);background:var(--cell);color:var(--text);border-radius:999px;padding:8px 14px;min-height:40px;font-size:.8rem;font-weight:700;cursor:pointer;}
.nl-switch.on{background:var(--accent);border-color:var(--accent);color:#fff;}
@media (max-width:360px){ .nl-app{padding:8px;} .nl-panel{padding:8px;} }
@media (prefers-reduced-motion:reduce){ .nl-app *{animation:none!important;transition:none!important;} }

/* --- layout shell: HUD bar + fill-height board + sibling controls (terakhir) --- */
.nl-app.nl-app{display:flex;flex-direction:column;gap:10px}
.nl-app [hidden]{display:none!important}
.nl-app .nl-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:none;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.nl-app .nl-hud .nl-chip{padding:5px 9px;font-size:10px}
.nl-app .nl-hud .nl-chip b{font-variant-numeric:tabular-nums}
.nl-app .nl-spacer{flex:1 1 auto}
.nl-app .nl-hud .nl-btn.nl-icon-btn{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:6px 10px;font-size:10px;border-radius:10px}
.nl-app .nl-hud .nl-btn.nl-icon-btn svg{flex:none;display:block}
.nl-app .nl-hud .nl-btn.on{border-color:var(--accent);color:var(--accent)}
.nl-app.game-fill > .nl-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;display:flex;align-items:center;justify-content:center;width:100%;padding:10px;border:1px solid var(--line);border-radius:16px;background:var(--panel);overflow:hidden}
.nl-app.game-fill > .nl-board.nl-menu{overflow:auto;align-items:flex-start;justify-content:flex-start}
.nl-app .nl-board > svg.nl-board{display:block;max-width:100%;max-height:100%;touch-action:none;cursor:pointer}
.nl-app .nl-board > svg.nl-board.nl-shake{animation:nl-shake .22s}
.nl-app .nl-controls{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;flex:none}
.nl-app .nl-controls .nl-btn{flex:1 1 96px;min-width:96px;max-width:180px}
.nl-app .nl-modal{display:flex;flex-direction:column;max-height:calc(100% - 8px);overflow:auto}
.nl-app .nl-modal .nl-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.nl-app .nl-modal .nl-head h3{margin:0;font-size:1.15rem}
.nl-app .nl-modal .nl-body{flex:1 1 auto;min-height:0;overflow:auto}
.nl-app .nl-modal .nl-foot{position:sticky;bottom:-22px;margin:12px -22px -22px;padding:12px 22px;background:var(--panel);border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}
.nl-app .nl-cheats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0}
.nl-app .nl-note{font-size:.72rem;color:var(--mut);margin-right:auto}
@media (max-width:640px){
 .nl-app .nl-hud{gap:5px;margin-bottom:2px}
 .nl-app .nl-hud .nl-chip{padding:4px 6px;font-size:9px}
 .nl-app .nl-hud .nl-chip[data-hud="tier-chip"],.nl-app .nl-hud .nl-chip[data-hud="hints-chip"],.nl-app .nl-hud .nl-chip[data-hud="best-chip"]{display:none}
 .nl-app .nl-hud .nl-btn.nl-icon-btn{min-height:32px;padding:5px 8px;font-size:9px}
 .nl-app .nl-hud .nl-btn-label,.nl-app .nl-spacer{display:none}
 .nl-app .nl-board{padding:6px}
 .nl-app .nl-controls .nl-btn{min-height:34px;padding:6px 8px;font-size:11px}
 .nl-app .nl-overlay{padding:8px}
 .nl-app .nl-modal{width:100%;height:100%;max-height:100%;padding:14px;border-radius:12px}
 .nl-app .nl-modal .nl-body{scrollbar-width:none}
 .nl-app .nl-modal .nl-body::-webkit-scrollbar{display:none}
 .nl-app .nl-modal .nl-foot{position:static;margin:10px -14px -14px;padding:10px 14px}
 .nl-app .nl-note{display:none}
}
</style>
<div class="game-app nl-app game-fill${settings.theme === "light" ? " nl-light" : ""}" data-nl>
  <div class="nl-hud">
    <span class="nl-chip">LV <b data-hud="level">1</b></span>
    <span class="nl-chip" data-hud="tier-chip">TIER <b data-hud="tier">Mudah</b></span>
    <span class="nl-chip">TIME <b data-hud="time">0:00</b></span>
    <span class="nl-chip">MOVES <b data-hud="moves">0</b></span>
    <span class="nl-chip" data-hud="hints-chip">HINTS <b data-hud="hints">0</b></span>
    <span class="nl-chip">LINKED <b data-hud="linked">0/0</b></span>
    <span class="nl-chip" data-hud="best-chip">BEST <b data-hud="best">★ 0</b></span>
    <span class="nl-spacer"></span>
    <button class="nl-btn nl-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="nl-btn-label">Help</span></button>
    <button class="nl-btn nl-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="nl-btn-label">Cheats</span></button>
    <button class="nl-btn nl-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="nl-btn-label">Pause</span></button>
    <button class="nl-btn nl-icon-btn" type="button" data-restart aria-label="Restart" title="Restart">${iconSVG("refresh", { size: 14 })}<span class="nl-btn-label">Restart</span></button>
    <button class="nl-btn nl-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="nl-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel nl-panel nl-board" data-board></section>
  <div class="nl-controls" data-controls>
    <button class="nl-btn nl-ghost" type="button" data-action="undo" data-undo>↩ Undo</button>
    <button class="nl-btn nl-ghost" type="button" data-action="reset">⟳ Reset</button>
    <button class="nl-btn" type="button" data-action="hint">💡 Petunjuk</button>
    <button class="nl-linkbtn" type="button" data-action="show-solution" data-solbtn hidden>Lihat Solusi</button>
  </div>
  <div data-solbanner></div>
  <div class="nl-overlay" data-overlay hidden></div>
</div>`;

    const app = root.querySelector(".nl-app");
    const panel = root.querySelector("[data-board]");
    const overlayEl = root.querySelector("[data-overlay]");
    const controlsEl = root.querySelector("[data-controls]");

    /* ---------- render layar ---------- */
    function starStr(n) { return "★".repeat(n) + `<span class="off">${"☆".repeat(3 - n)}</span>`; }

    function homeHTML() {
        return `
<div class="nl-home">
  <svg class="nl-home-logo" viewBox="0 0 100 100" aria-hidden="true">
    <rect x="2" y="2" width="96" height="96" rx="14" fill="var(--cell)" stroke="var(--grid)" stroke-width="2" stroke-dasharray="1 6"/>
    <polyline points="25,25 25,75 75,75" fill="none" stroke="${color(4)}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
    <circle cx="25" cy="25" r="14" fill="${color(4)}"/><text x="25" y="26" font-size="16" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="var(--disc)">1</text>
    <circle cx="75" cy="75" r="14" fill="${color(4)}"/><text x="75" y="76" font-size="16" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="var(--disc)">1</text>
    <rect x="60" y="14" width="22" height="22" rx="4" fill="var(--block)" stroke="var(--blockline)"/>
  </svg>
  <h3>Number Link</h3>
  <p class="nl-sub">30 level teka-teki logika · santai, tanpa batas waktu</p>
  <div class="nl-home-stars">★ ${totalStars()} / ${LEVELS.length * 3}</div>
  <div class="nl-home-btns">
    <button class="nl-btn" data-action="play-continue">▶ Main — Level ${LEVELS[continueIndex()].id}</button>
    <button class="nl-btn nl-ghost" data-action="nav-levels">🗂 Pilih Level</button>
    <button class="nl-btn nl-ghost" data-action="open-settings">⚙️ Pengaturan</button>
  </div>
</div>`;
    }

    function levelsHTML() {
        const group = (diff, from, to) => {
            const t = TIER[diff];
            const tiles = LEVELS.slice(from, to).map((l, k) => {
                const i = from + k, un = isUnlocked(i), st = starsOf(l.id);
                return `<button class="nl-tile${st ? " nl-done" : ""}" data-action="start-level" data-level="${i}" ${un ? "" : "disabled"}
          aria-label="Level ${l.id}${un ? `, ${st} bintang` : ", terkunci"}">
          <span class="nl-tile-num">${un ? l.id : "🔒"}</span>
          ${un ? `<span class="nl-tile-stars">${starStr(st)}</span>` : ""}
        </button>`;
            }).join("");
            return `<div class="nl-tier-title ${t.cls}">${t.label} · ${LEVELS[from].id}–${LEVELS[to - 1].id}</div><div class="nl-tiles">${tiles}</div>`;
        };
        return `
<div class="nl-lv-head">
  <button class="nl-icon-btn" data-action="nav-home" aria-label="Kembali">←</button>
  <h3>Pilih Level</h3>
  <span class="nl-home-stars">★ ${totalStars()}</span>
</div>
${group("easy", 0, 10)}${group("medium", 10, 20)}${group("hard", 20, 30)}`;
    }

    function boardSVG() {
        const sz = S.size, W = sz * 100;
        const pt = (c) => (c[1] * 100 + 50) + "," + (c[0] * 100 + 50);
        let cells = "";
        for (let r = 0; r < sz; r++) for (let c = 0; c < sz; c++) {
            const bl = S.blocked.has(r + "," + c);
            cells += `<rect class="nl-cell${bl ? " nl-blocked" : ""}" x="${c * 100 + 3}" y="${r * 100 + 3}" width="94" height="94" rx="10"/>`;
        }
        const paths = S.pairs.map((p) =>
            `<polyline class="nl-path" data-path="${p.number}" stroke="${color(p.number)}" points=""/>`).join("");
        const ends = S.pairs.map((p) => [p.a, p.b].map((c) =>
            `<g class="nl-end" data-end="${p.number}" fill="${color(p.number)}">
        <circle cx="${c[1] * 100 + 50}" cy="${c[0] * 100 + 50}" r="32" fill="${color(p.number)}"/>
        <text x="${c[1] * 100 + 50}" y="${c[0] * 100 + 52}" fill="${color(p.number)}">${p.number}</text>
        <title>Angka ${p.number}, baris ${c[0] + 1} kolom ${c[1] + 1}</title>
      </g>`).join("")).join("");
        return `<svg class="nl-board" data-nl-board viewBox="0 0 ${W} ${W}" role="img"
      aria-label="Papan ${sz} kali ${sz}, ${S.pairs.length} pasangan angka, ${S.blocked.size} kotak hitam">
      <g>${cells}</g><g data-paths>${paths}</g><g data-hl></g><g>${ends}</g><g data-flash></g></svg>`;
    }

    function gameHTML() {
        return boardSVG();
    }

    // SVG langsung di dalam panel; ukurannya mengikuti sisi terpendek panel
    // supaya pemetaan koordinat drag tetap 1:1.
    function fitBoard() {
        const svg = panel.querySelector("svg[data-nl-board]"); if (!svg) return;
        const cs = getComputedStyle(panel);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const side = Math.max(80, Math.min(panel.clientWidth - padX, panel.clientHeight - padY));
        svg.style.width = side + "px";
        svg.style.height = side + "px";
    }

    function render() {
        const playing = S.screen === "game";
        panel.classList.toggle("nl-menu", !playing);
        controlsEl.hidden = !playing;
        const banner = root.querySelector("[data-solbanner]"); if (banner) banner.hidden = !playing;
        if (S.screen === "home") panel.innerHTML = homeHTML();
        else if (S.screen === "levels") panel.innerHTML = levelsHTML();
        else {
            panel.innerHTML = gameHTML();
            fitBoard();
            updateBoard();
        }
        syncUI();
    }

    /* ---------- update papan incremental (60 fps drag) ---------- */
    function updateBoard() {
        const svg = panel.querySelector("svg[data-nl-board]"); if (!svg) return;
        const pt = (c) => (c[1] * 100 + 50) + "," + (c[0] * 100 + 50);
        for (const p of S.pairs) {
            const n = p.number, cellsArr = S.paths[n] || [];
            const pl = svg.querySelector(`[data-path="${n}"]`);
            pl.setAttribute("points", cellsArr.map(pt).join(" "));
            pl.classList.toggle("nl-active", S.dragging && S.activeNum === n);
            const done = isComplete(n);
            // Endpoint tujuan adalah kebalikan dari pangkal path yang sedang digambar.
            let opposite = p.a;
            if (cellsArr.length > 0 && same(p.a, cellsArr[0])) opposite = p.b;
            const reachedEnd = cellsArr.length > 0 && same(cellsArr[cellsArr.length - 1], opposite);
            const targeting = S.dragging && S.activeNum === n && cellsArr.length > 0 && !reachedEnd;
            svg.querySelectorAll(`[data-end="${n}"]`).forEach((g) => {
                g.classList.toggle("nl-done", done);
                g.classList.toggle("nl-target", Boolean(targeting) && !done);
            });
        }
        // sorot sel tujuan valid berikutnya saat drag (PRD §8)
        const hl = svg.querySelector("[data-hl]");
        if (S.dragging && S.activeNum != null && S.paths[S.activeNum]?.length) {
            const path = S.paths[S.activeNum], last = path[path.length - 1];
            let dots = "";
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nc = [last[0] + dr, last[1] + dc];
                if (nc[0] < 0 || nc[1] < 0 || nc[0] >= S.size || nc[1] >= S.size) continue;
                if (S.blocked.has(key(nc))) continue;
                const ep = endpointAt(nc);
                if (ep && ep.number !== S.activeNum) continue;
                if (idxOf(path, nc) >= 0) continue;
                dots += `<circle cx="${nc[1] * 100 + 50}" cy="${nc[0] * 100 + 50}" r="11" fill="${color(S.activeNum)}" opacity=".45"/>`;
            }
            hl.innerHTML = dots;
        } else hl.innerHTML = "";
    }

    function updateHUD() {
        const set = (k, v) => { const el = app.querySelector(`[data-hud="${k}"]`); if (el) el.textContent = v; };
        const l = level();
        set("level", l.id);
        set("tier", TIER[l.difficulty].label);
        set("time", fmt(elapsed()));
        set("best", "★ " + totalStars());
        if (S.screen !== "game") return;
        set("moves", S.moves);
        set("hints", S.hints);
        set("linked", linkedCount() + "/" + S.pairs.length);
        const ub = panel.querySelector("[data-undo]"); if (ub) ub.disabled = !S.history.length || S.won || S.solutionShown;
        const sb = root.querySelector("[data-solbtn]");
        if (sb) sb.hidden = S.won || S.solutionShown || !(S.resets >= 2 || elapsed() > l.targetTimeSec * 3);
    }
    const boardDirty = () => { updateBoard(); syncUI(); };

    /* ---------- overlay / modal ---------- */
    function currentOverlay() {
        if (helpOpen) return "help";
        if (cheatsOpen) return "cheats";
        if (S.overlay) return S.overlay;      // settings | tutorial | win
        if (S.screen === "game" && S.paused) return "pause";
        return null;
    }

    function syncOverlays(force = false) {
        const name = currentOverlay();
        if (!name) {
            overlayEl.hidden = true; overlayEl.innerHTML = "";
            delete overlayEl.dataset.kind;
            return;
        }
        if (!force && overlayEl.dataset.kind === name && !overlayEl.hidden) return;
        overlayEl.dataset.kind = name;
        overlayEl.innerHTML = `<div class="nl-modal">${overlayHTML(name)}</div>`;
        overlayEl.hidden = false;
    }

    function overlayHTML(name) {
        if (name === "help") return helpHTML();
        if (name === "cheats") return cheatsHTML();
        if (name === "pause") return pauseHTML();
        if (name === "settings") return settingsHTML();
        if (name === "tutorial") return tutorialHTML();
        if (name === "win") return winHTML();
        return "";
    }

    function closeOverlay() { S.overlay = null; S.confirmReset = false; syncOverlays(); }

    function syncUI() {
        updateHUD();
        const pbtn = app.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".nl-btn-label");
            if (label) label.textContent = S.paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", S.paused ? "Resume" : "Pause");
            pbtn.title = S.paused ? "Resume (P)" : "Pause (P)";
        }
        const cbtn = app.querySelector("[data-cheats]");
        if (cbtn) cbtn.classList.toggle("on", cheatsOpen || S.cheated);
        syncOverlays();
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncUI();
    }

    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        syncUI();
    }

    function togglePause() {
        if (S.screen !== "game" || S.won || S.solutionShown || helpOpen || cheatsOpen || S.overlay) return;
        if (S.paused) {
            S.startAt += performance.now() - S.pauseStartedAt;
            S.paused = false;
            S.pauseStartedAt = 0;
        } else {
            S.paused = true;
            S.pauseStartedAt = performance.now();
        }
        snd.click(); syncUI();
    }

    function settingsHTML() {
        return `
<div class="nl-head"><h3>⚙️ Pengaturan</h3></div>
<div class="nl-body">
<div class="nl-set-row"><span>🔊 Suara</span><button class="nl-switch${settings.sound ? " on" : ""}" data-action="toggle-sound">${settings.sound ? "ON" : "OFF"}</button></div>
<div class="nl-set-row"><span>📳 Getar (haptic)</span><button class="nl-switch${settings.haptics ? " on" : ""}" data-action="toggle-haptics">${settings.haptics ? "ON" : "OFF"}</button></div>
<div class="nl-set-row"><span>🎨 Tema</span><button class="nl-switch" data-action="toggle-theme">${settings.theme === "light" ? "☀️ Terang" : "🌙 Gelap"}</button></div>
<div class="nl-set-row"><span>🗑 Progres</span><button class="nl-switch${S.confirmReset ? " on" : ""}" data-action="reset-progress" style="${S.confirmReset ? "background:#dc2626;border-color:#dc2626" : ""}">${S.confirmReset ? "Yakin? Klik lagi" : "Reset progres"}</button></div>
</div>
<div class="nl-foot"><button class="nl-btn" data-action="close-overlay">Tutup</button></div>`;
    }

    function openSettings(force = false) { S.overlay = "settings"; syncOverlays(force); }

    // Tutorial level 1 — sengaja dipisah dari bantuan umum (H).
    function tutorialHTML() {
        return `
<div class="nl-head"><h3>Cara Main 👋</h3></div>
<div class="nl-body">
<p class="nl-sub">30 detik saja, janji.</p>
<div class="nl-tut-list">
  <div><span class="ic">👆</span><span><b>Tekan angka lalu tarik</b> ke angka kembarannya. Garis hanya bergerak atas / bawah / kiri / kanan.</span></div>
  <div><span class="ic">⬛</span><span>Hindari <b>kotak hitam</b>, angka lain, dan garis lain. Menimpa garis lama akan memotongnya.</span></div>
  <div><span class="ic">🏆</span><span>Sambungkan <b>semua pasangan</b> untuk menang. Ketuk angka untuk menghapus garisnya, atau pakai Undo / Reset.</span></div>
</div>
</div>
<div class="nl-foot"><button class="nl-btn" data-action="tutorial-done">Mulai Main</button></div>`;
    }

    function openTutorial() {
        S.overlay = "tutorial";
        if (!S.paused) { S.paused = true; S.pauseStartedAt = performance.now(); }
        syncOverlays();
    }

    function helpHTML() {
        return `
<div class="nl-head"><h3>Cara Main Number Link</h3><button class="nl-btn nl-ghost" type="button" data-help-close aria-label="Tutup bantuan">✕</button></div>
<div class="nl-body">
<div class="nl-tut-list">
  <div><span class="ic">1️⃣</span><span>Tiap angka muncul <b>dua kali</b>. Tarik dari satu angka ke kembarannya.</span></div>
  <div><span class="ic">↔️</span><span>Garis hanya bergerak <b>atas / bawah / kiri / kanan</b>, satu kotak per langkah.</span></div>
  <div><span class="ic">🚫</span><span>Tidak boleh lewat kotak hitam, angka lain, atau garis lain. Menimpa garis lama akan memotongnya.</span></div>
  <div><span class="ic">🏆</span><span>Sambungkan <b>semua pasangan</b>. Bintang: 1 untuk menang, 2 tanpa bantuan, 3 tanpa bantuan dan di bawah target waktu.</span></div>
</div>
<p class="nl-sub">Pintasan: <b>H</b> bantuan · <b>C</b> cheats · <b>P</b>/<b>Esc</b> jeda · <b>R</b> reset level.</p>
</div>
<div class="nl-foot"><span class="nl-note">Tekan H untuk membuka lagi</span><button class="nl-btn nl-ghost" type="button" data-action="open-settings">⚙️ Pengaturan</button><button class="nl-btn" type="button" data-help-close>Mengerti</button></div>`;
    }

    function cheatsHTML() {
        const confirm = S.confirmReset;
        return `
<div class="nl-head"><h3>🛠 Cheats</h3><button class="nl-btn nl-ghost" type="button" data-cheats-close aria-label="Tutup cheats">✕</button></div>
<div class="nl-body">
<p class="nl-sub">Cheat apa pun membuat putaran ini hanya mendapat 1 bintang.</p>
<div class="nl-cheats">
  <button class="nl-btn nl-ghost" type="button" data-cheat="hint">💡 Petunjuk</button>
  <button class="nl-btn nl-ghost" type="button" data-cheat="reveal">👁 Tampilkan satu jalur</button>
  <button class="nl-btn nl-ghost" type="button" data-cheat="solution">✅ Lihat solusi</button>
  <button class="nl-btn nl-warn" type="button" data-cheat="reset-progress"${confirm ? ' style="background:#dc2626"' : ""}>${confirm ? "Yakin? Klik lagi" : "🗑 Reset progres"}</button>
</div>
</div>
<div class="nl-foot"><button class="nl-btn" type="button" data-cheats-close>Tutup</button></div>`;
    }

    function pauseHTML() {
        return `
<div class="nl-head"><h3>⏸ Jeda</h3></div>
<div class="nl-body"><p class="nl-sub">Waktu dihentikan. Lanjutkan saat siap.</p></div>
<div class="nl-foot">
  <button class="nl-btn" type="button" data-action="resume">Lanjutkan</button>
  <button class="nl-btn nl-ghost" type="button" data-action="reset">Reset level</button>
  <button class="nl-btn nl-ghost" type="button" data-exit>Keluar</button>
</div>`;
    }

    function winHTML() {
        const w = S.win;
        if (!w) return "";
        return `
<div class="nl-stars-big">${[1, 2, 3].map((n) => `<span class="${n <= w.stars ? "on" : ""}">★</span>`).join("")}</div>
<div class="nl-head"><h3>Level ${w.l.id} Selesai!</h3></div>
<div class="nl-body">
<p class="nl-sub">Hebat, ${playerName}! ${w.note}</p>
<div class="nl-win-stats">
  <span>⏱ Waktu<b>${fmt(w.t)}</b></span>
  <span>👣 Langkah<b>${w.moves}</b></span>
  <span>💡 Petunjuk<b>${w.hints}</b></span>
</div>
</div>
<div class="nl-foot">
  ${w.hasNext ? `<button class="nl-btn" data-action="next-level">Level Berikutnya ▶</button>` : `<button class="nl-btn" data-action="nav-levels">🏆 Semua Level Tamat!</button>`}
  <button class="nl-btn nl-ghost" data-action="replay">⟳ Ulangi</button>
  <button class="nl-btn nl-ghost" data-action="nav-levels">🗂 Pilih Level</button>
</div>`;
    }

    function resetProgress() {
        progress = { levels: {}, tutorialSeen: false };
        save(STORE_PROGRESS, progress);
        try { localStorage.setItem(META.bestKey, "0"); } catch (_) { /* blocked */ }
        S.confirmReset = false; helpOpen = false; cheatsOpen = false;
        closeOverlay(); S.screen = "home"; render(); snd.click();
    }

    function handleCheat(kind) {
        if (kind === "hint") useHint();
        else if (kind === "reveal") revealPath();
        else if (kind === "solution") showSolution();
        else if (kind === "reset-progress") {
            if (!S.confirmReset) { S.confirmReset = true; syncOverlays(true); snd.click(); return; }
            resetProgress();
        }
    }

    /* ---------- alur level ---------- */
    function startLevel(i) {
        const l = LEVELS[i];
        S.li = i; S.size = l.size;
        S.blocked = new Set(l.blocked.map(key));
        S.pairs = l.pairs; S.ends = {};
        l.pairs.forEach((p) => (S.ends[p.number] = p));
        S.paths = {}; S.history = []; S.moves = 0; S.hints = 0;
        S.resets = resetsByLevel[l.id] || 0;
        S.activeNum = null; S.dragging = false; S.pre = null;
        S.won = false; S.solutionShown = false; S.cheated = false; S.win = null;
        S.elapsedFinal = null; S.paused = false; S.pauseStartedAt = 0;
        S.startAt = performance.now();
        S.screen = "game";
        helpOpen = false; cheatsOpen = false;
        closeOverlay(); render();
        if (l.id === 1 && !progress.tutorialSeen) openTutorial();
    }

    function resetLevel() {
        if (S.screen !== "game") return;
        S.resets += 1; resetsByLevel[level().id] = S.resets;
        S.paths = {}; S.history = []; S.moves = 0; S.hints = 0;
        S.won = false; S.solutionShown = false; S.cheated = false; S.win = null;
        S.elapsedFinal = null; S.paused = false; S.pauseStartedAt = 0;
        S.dragging = false; S.activeNum = null;
        S.startAt = performance.now();
        helpOpen = false; cheatsOpen = false;
        closeOverlay();
        const sb = root.querySelector("[data-solbanner]"); if (sb) sb.innerHTML = "";
        snd.click(); render();
    }

    function checkWin() {
        if (S.won || S.solutionShown || S.screen !== "game") return;
        if (!S.pairs.every((p) => isComplete(p.number))) return;
        // MENANG (FR-7, PRD §4) — bintang hanya untuk putaran tanpa cheat.
        S.won = true; S.elapsedFinal = elapsed();
        const t = S.elapsedFinal, l = level();
        const stars = 1 + (S.cheated ? 0 : 1) + (!S.cheated && t <= l.targetTimeSec ? 1 : 0);
        const prev = progress.levels[l.id] || {};
        progress.levels[l.id] = {
            stars: Math.max(prev.stars || 0, stars),
            bestTimeSec: Math.min(prev.bestTimeSec ?? Infinity, Math.round(t)),
            bestMoves: Math.min(prev.bestMoves ?? Infinity, S.moves),
        };
        save(STORE_PROGRESS, progress);
        try { localStorage.setItem(META.bestKey, String(totalStars())); } catch (_) { /* blocked */ }
        snd.win(); buzz([30, 40, 60]);
        const hasNext = S.li < LEVELS.length - 1;
        const note = S.cheated ? "Cheat terpakai, jadi 1 bintang."
            : stars === 3 ? "Sempurna! Cepat dan tanpa petunjuk. 🌟"
                : stars === 2 ? `Tanpa petunjuk! Selesai di bawah ${fmt(l.targetTimeSec)} untuk ⭐⭐⭐.`
                    : "Selesai! Coba tanpa petunjuk untuk bintang lebih banyak.";
        S.win = { l, t, stars, hasNext, note, moves: S.moves, hints: S.hints };
        syncUI();
        later(() => { if (S.won) { S.overlay = "win"; syncOverlays(); } }, 450);
    }

    /* ---------- petunjuk & solusi (FR-10, P1) ---------- */
    function pathMatchesSolution(n) {
        const p = S.paths[n]; if (!p) return false;
        const sol = level().solution[String(n)];
        if (p.length !== sol.length) return false;
        const fwd = p.every((c, i) => same(c, sol[i]));
        const rev = p.every((c, i) => same(c, sol[sol.length - 1 - i]));
        return fwd || rev;
    }
    function useHint() {
        if (S.screen !== "game" || S.won || S.solutionShown) return;
        const target = S.pairs.find((p) => !pathMatchesSolution(p.number));
        if (!target) return;
        const pre = { str: snap(), paths: clone(S.paths), moves: S.moves };
        const sol = clone(level().solution[String(target.number)]);
        for (const c of sol) { const o = ownerAt(c, target.number); if (o != null) cutPath(o, c); }
        S.paths[target.number] = sol;
        S.hints += 1; S.cheated = true;
        pushHistory(pre);
        snd.hint(); buzz(20);
        boardDirty(); checkWin();
    }
    // Cheat panel: tampilkan satu jalur yang belum tersambung.
    function revealPath() {
        if (S.screen !== "game" || S.won || S.solutionShown) return;
        const target = S.pairs.find((p) => !isComplete(p.number));
        if (!target) return;
        const pre = { str: snap(), paths: clone(S.paths), moves: S.moves };
        const sol = clone(level().solution[String(target.number)]);
        for (const c of sol) { const o = ownerAt(c, target.number); if (o != null) cutPath(o, c); }
        S.paths[target.number] = sol;
        S.cheated = true;
        pushHistory(pre);
        snd.hint(); buzz(20);
        boardDirty(); checkWin();
    }
    function showSolution() {
        if (S.screen !== "game" || S.won || S.solutionShown) return;
        S.solutionShown = true; S.cheated = true; S.elapsedFinal = elapsed();
        S.dragging = false; S.activeNum = null;
        cheatsOpen = false; S.overlay = null;
        S.paths = clone(level().solution);
        snd.click(); boardDirty();
        const sb = root.querySelector("[data-solbanner]");
        if (sb) sb.innerHTML = `<div class="nl-sol-banner"><span>Ini salah satu solusi valid. Bintang tidak dihitung untuk percobaan ini.</span>
      <button class="nl-btn nl-ghost" data-action="reset">Coba Lagi</button>
      <button class="nl-btn nl-ghost" data-action="nav-levels">Pilih Level</button></div>`;
    }

    /* ---------- input drag (FR-3..FR-6) ---------- */
    const getSvg = () => panel.querySelector("svg[data-nl-board]");
    function cellFromEvent(e) {
        const svg = getSvg(); if (!svg) return null;
        const r = svg.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        if (px < -20 || py < -20 || px > r.width + 20 || py > r.height + 20) return null;
        const c = Math.min(S.size - 1, Math.max(0, Math.floor((px / r.width) * S.size)));
        const rr = Math.min(S.size - 1, Math.max(0, Math.floor((py / r.height) * S.size)));
        return [rr, c];
    }
    function invalidFeedback(c) {
        const now = performance.now();
        if (now - S.lastErr < 280) return;
        S.lastErr = now;
        snd.error(); buzz(35);
        const wrap = getSvg();
        if (wrap) { wrap.classList.remove("nl-shake"); void wrap.offsetWidth; wrap.classList.add("nl-shake"); }
        const svg = getSvg();
        if (svg && c) {
            const g = svg.querySelector("[data-flash]");
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("class", "nl-flash");
            rect.setAttribute("x", c[1] * 100 + 3); rect.setAttribute("y", c[0] * 100 + 3);
            rect.setAttribute("width", 94); rect.setAttribute("height", 94); rect.setAttribute("rx", 10);
            g.appendChild(rect); later(() => rect.remove(), 320);
        }
    }
    function finalizeGesture(connect) {
        if (S.activeNum != null) {
            const p = S.paths[S.activeNum];
            if (p && p.length < 2) delete S.paths[S.activeNum]; // ketuk endpoint = hapus path
        }
        if (S.pre) pushHistory(S.pre);
        S.pre = null; S.dragging = false; S.activeNum = null;
        if (connect) { snd.connect(); buzz(20); }
        boardDirty(); checkWin();
    }
    function tryStep(nx) {
        if (nx[0] < 0 || nx[1] < 0 || nx[0] >= S.size || nx[1] >= S.size) return false;
        if (S.blocked.has(key(nx))) return false;                       // FR-4
        const ep = endpointAt(nx);
        if (ep && ep.number !== S.activeNum) return false;              // aturan 7
        const path = S.paths[S.activeNum];
        const own = idxOf(path, nx);
        if (own >= 0) { path.length = own + 1; boardDirty(); return true; } // backtrack
        const other = ownerAt(nx, S.activeNum);
        if (other != null) cutPath(other, nx);                          // FR-5 timpa eksplisit
        path.push(nx); S.moves += 1;
        if (ep && ep.number === S.activeNum) { finalizeGesture(true); return true; } // FR-6 lock
        const now = performance.now();
        if (now - S.lastStep > 70) { S.lastStep = now; snd.step(); }
        boardDirty(); return true;
    }
    function stepToward(target) {
        let guard = S.size * 3;
        while (S.dragging && guard-- > 0) {
            const path = S.paths[S.activeNum]; if (!path?.length) break;
            const last = path[path.length - 1];
            if (same(last, target)) break;
            const ti = idxOf(path, target);
            if (ti >= 0) { path.length = ti + 1; boardDirty(); continue; } // backtrack cepat
            const dr = target[0] - last[0], dc = target[1] - last[1];
            const vert = [last[0] + Math.sign(dr), last[1]];
            const hor = [last[0], last[1] + Math.sign(dc)];
            const cands = dr !== 0 && dc !== 0
                ? (Math.abs(dr) >= Math.abs(dc) ? [vert, hor] : [hor, vert])
                : dr !== 0 ? [vert] : [hor];
            let moved = false;
            for (const nx of cands) if (tryStep(nx)) { moved = true; break; }
            if (!moved) { invalidFeedback(target); break; }
        }
    }
    function onPointerDown(e) {
        if (S.screen !== "game" || S.won || S.solutionShown || S.paused || helpOpen || cheatsOpen || S.overlay || !overlayEl.hidden) return;
        if (!e.target.closest("svg[data-nl-board]")) return;
        const c = cellFromEvent(e); if (!c) return;
        e.preventDefault();
        if (S.blocked.has(key(c))) { invalidFeedback(c); return; }
        S.pre = { str: snap(), paths: clone(S.paths), moves: S.moves };
        const ep = endpointAt(c);
        if (ep) {
            // mulai path baru dari endpoint (path lama pair ini dihapus)
            S.paths[ep.number] = [[c[0], c[1]]];
            S.activeNum = ep.number;
        } else {
            const o = ownerAt(c, null);
            if (o == null) { S.pre = null; return; } // sel kosong: tidak bisa mulai
            const p = S.paths[o]; p.length = idxOf(p, c) + 1; // lanjut dari tengah path
            S.activeNum = o;
        }
        S.dragging = true; S.pointerId = e.pointerId;
        try { panel.setPointerCapture(e.pointerId); } catch { }
        boardDirty();
    }
    function onPointerMove(e) {
        if (!S.dragging || e.pointerId !== S.pointerId) return;
        e.preventDefault();
        const c = cellFromEvent(e); if (!c) return;
        stepToward(c);
    }
    function onPointerUp(e) {
        if (!S.dragging || e.pointerId !== S.pointerId) return;
        finalizeGesture(false);
    }
    function onContextMenu(e) { if (e.target.closest("svg[data-nl-board]")) e.preventDefault(); }

    /* ---------- aksi tombol ---------- */
    function handleClick(e) {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheats-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-restart]")) { resetLevel(); return; }
        const cheat = t.closest("[data-cheat]");
        if (cheat) { handleCheat(cheat.dataset.cheat); return; }
        const btn = t.closest("[data-action]");
        if (!btn || !root.contains(btn)) return;
        const a = btn.dataset.action;
        switch (a) {
            case "nav-home":
            case "nav-levels":
                S.screen = a === "nav-home" ? "home" : "levels";
                S.paused = false; S.pauseStartedAt = 0;
                helpOpen = false; cheatsOpen = false;
                closeOverlay(); render(); snd.click(); break;
            case "play-continue": startLevel(continueIndex()); snd.click(); break;
            case "start-level": {
                const i = +btn.dataset.level;
                if (isUnlocked(i)) { startLevel(i); snd.click(); }
                break;
            }
            case "open-settings": openSettings(); snd.click(); break;
            case "close-overlay": closeOverlay(); break;
            case "resume": togglePause(); break;
            case "tutorial-done":
                progress.tutorialSeen = true; save(STORE_PROGRESS, progress);
                if (S.paused && S.pauseStartedAt) S.startAt += performance.now() - S.pauseStartedAt;
                S.paused = false; S.pauseStartedAt = 0;
                closeOverlay(); syncUI(); snd.click();
                break;
            case "undo": {
                const h = S.history.pop();
                if (h && !S.won && !S.solutionShown) { S.paths = clone(h.paths); S.moves = h.moves; snd.click(); boardDirty(); }
                break;
            }
            case "reset": resetLevel(); break;
            case "hint": useHint(); break;
            case "show-solution": showSolution(); break;
            case "next-level": if (S.li < LEVELS.length - 1) startLevel(S.li + 1); break;
            case "replay": startLevel(S.li); break;
            case "toggle-sound": settings.sound = !settings.sound; save(STORE_SETTINGS, settings); openSettings(true); snd.click(); break;
            case "toggle-haptics": settings.haptics = !settings.haptics; save(STORE_SETTINGS, settings); openSettings(true); buzz(20); break;
            case "toggle-theme":
                settings.theme = settings.theme === "light" ? "dark" : "light";
                save(STORE_SETTINGS, settings);
                app.classList.toggle("nl-light", settings.theme === "light");
                render(); openSettings(true);
                break;
            case "reset-progress":
                if (!S.confirmReset) { S.confirmReset = true; syncOverlays(true); break; }
                resetProgress();
                break;
        }
    }

    /* ---------- keyboard: H → C → P/Esc → R → aksi game (drag) ---------- */
    function onKeyDown(e) {
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const c = e.code;
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (S.overlay) closeOverlay();
            else togglePause();
            e.preventDefault(); return;
        }
        if (c === "KeyR") {
            if (!helpOpen && !cheatsOpen && !S.overlay && S.screen === "game") { resetLevel(); e.preventDefault(); }
            return;
        }
        if (c === "Enter") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (S.overlay) closeOverlay();
            else if (S.paused) togglePause();
            e.preventDefault(); return;
        }
        // Papan memakai drag; tidak ada kursor keyboard, jadi panah sengaja tidak diikat.
    }

    /* ---------- timer (FR-11) ---------- */
    const timerId = setInterval(() => {
        if (S.screen === "game" && !S.won && !S.solutionShown && !S.paused) updateHUD();
    }, 250);

    /* ---------- pasang listener & mulai ---------- */
    document.addEventListener("keydown", onKeyDown);
    let boardRO = null;
    if (typeof ResizeObserver !== "undefined") {
        boardRO = new ResizeObserver(() => fitBoard());
        boardRO.observe(panel);
    }
    root.addEventListener("click", handleClick);
    panel.addEventListener("pointerdown", onPointerDown);
    panel.addEventListener("pointermove", onPointerMove);
    panel.addEventListener("pointerup", onPointerUp);
    panel.addEventListener("pointercancel", onPointerUp);
    panel.addEventListener("contextmenu", onContextMenu);
    try { localStorage.setItem(META.bestKey, String(totalStars())); } catch { }
    render();

    return {
        destroy() {
            clearInterval(timerId);
            timeouts.forEach(clearTimeout); timeouts.clear();
            document.removeEventListener("keydown", onKeyDown);
            if (boardRO) { boardRO.disconnect(); boardRO = null; }
            root.removeEventListener("click", handleClick);
            panel.removeEventListener("pointerdown", onPointerDown);
            panel.removeEventListener("pointermove", onPointerMove);
            panel.removeEventListener("pointerup", onPointerUp);
            panel.removeEventListener("pointercancel", onPointerUp);
            panel.removeEventListener("contextmenu", onContextMenu);
            if (actx) { try { actx.close(); } catch { } actx = null; }
        },
    };
}
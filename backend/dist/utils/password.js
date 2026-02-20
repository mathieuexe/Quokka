import bcrypt from "bcryptjs";
const ROUNDS = 12;
export async function hashPassword(rawPassword) {
    return bcrypt.hash(rawPassword, ROUNDS);
}
export async function comparePassword(rawPassword, hash) {
    return bcrypt.compare(rawPassword, hash);
}

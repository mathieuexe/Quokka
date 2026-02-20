function sanitizePseudoPrefix(pseudo) {
    const cleaned = pseudo
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase();
    if (cleaned.length >= 2)
        return cleaned.slice(0, 2);
    if (cleaned.length === 1)
        return `${cleaned}X`;
    return "XX";
}
function hashToModulo(input, modulo) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash % modulo;
}
export function generateCustomerReference(pseudo, userId) {
    const prefix = sanitizePseudoPrefix(pseudo);
    const number = String(hashToModulo(`${userId}:${pseudo}`, 10000)).padStart(4, "0");
    return `${prefix}-${number}-QK`;
}
export function generateOrderReference(orderId) {
    return String(hashToModulo(orderId, 100000000)).padStart(8, "0");
}

// Endereço da função do Neon (sem barra no final). Não é segredo.
const NEON_URL = '';
window.API = location.hostname === 'localhost' ? location.origin + '/api' : NEON_URL;

// Endereço da função do Neon (sem barra no final). Não é segredo.
const NEON_URL = 'https://br-blue-grass-bdhjg2ip-api.compute.c-8.us-east-2.aws.neon.tech';
window.API = location.hostname === 'localhost' ? location.origin + '/api' : NEON_URL;

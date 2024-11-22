
const { Client } = require('pg');

const client = new Client({
  host: '146.59.158.209',
  port: 5432, 
  user: 'moovers_app_sys',
  password: 'SG5WxnbXhtyvJC6U8cERYKrDF4se9Bg2',
  database: 'moovers_app',
});

client.connect()
  .then(() => console.log('Connecté à la base de données PostgreSQL'))
  .catch(err => console.error('Erreur de connexion à la base de données', err));

module.exports = client;

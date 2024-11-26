const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
require('dotenv').config();

let webSocketClients = new Map(); // Gérer les connexions actives
const SECRET_KEY = process.env.SECRET_KEY; // Clé secrète pour décoder le JWT

/**
 * Fonction pour initialiser le WebSocket avec le serveur HTTP.
 */
function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    console.log('Nouvelle connexion WebSocket.');

    // Identifier l'utilisateur via le token JWT passé dans l'URL
    const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');
    if (!token) {
      ws.close();
      console.log('Connexion WebSocket fermée : token non fourni.');
      return;
    }

    let userId;
    try {
      // Décoder le token JWT pour récupérer l'ID utilisateur
      const decoded = jwt.verify(token, SECRET_KEY);
      userId = decoded.id;

      // Ajouter la connexion au gestionnaire
      webSocketClients.set(userId, ws);
      console.log(`Utilisateur connecté au WebSocket : ${userId}`);
    } catch (err) {
      console.error('Erreur lors du décodage du token JWT :', err.message);
      ws.close();
      return;
    }

    // Gérer les messages reçus via WebSocket
    ws.on('message', (message) => {
      console.log(`Message reçu de l'utilisateur ${userId} : ${message}`);
      // Logique pour traiter les messages si nécessaire
    });

    // Supprimer la connexion lors de la déconnexion
    ws.on('close', () => {
      webSocketClients.delete(userId);
      console.log(`Connexion WebSocket fermée pour l'utilisateur : ${userId}`);
    });
  });

  return wss;
}

/**
 * Diffuse un message à un utilisateur spécifique via WebSocket.
 * @param {string} userId - ID de l'utilisateur destinataire.
 * @param {Object} message - Message à envoyer.
 */
function broadcastToUser(userId, message) {
  const ws = webSocketClients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.log(`WebSocket non disponible pour l'utilisateur : ${userId}`);
  }
}

module.exports = { setupWebSocket, broadcastToUser };

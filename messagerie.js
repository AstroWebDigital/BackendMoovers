const express = require('express');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const client = require('./db'); // Connexion à la base de données
require('dotenv').config();

const app = express();
app.use(express.json()); // Middleware pour parser le JSON

const SECRET_KEY = process.env.SECRET_KEY; // Assurez-vous que cette clé est définie dans votre fichier .env

// Gestion des connexions WebSocket
const webSocketClients = new Map(); // Map pour stocker les connexions actives

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    console.log('Nouvelle connexion WebSocket.');

    // Identifier l'utilisateur via un token JWT passé dans l'URL
    const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');
    if (!token) {
      ws.close();
      console.log('Connexion WebSocket fermée : token non fourni.');
      return;
    }

    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      const userId = decoded.id;

      // Ajouter la connexion au gestionnaire
      webSocketClients.set(userId, ws);

      console.log(`Utilisateur connecté au WebSocket : ${userId}`);

      // Gérer les messages reçus via WebSocket
      ws.on('message', (message) => {
        console.log(`Message WebSocket reçu de ${userId} : ${message}`);
      });

      // Supprimer la connexion lors de la déconnexion
      ws.on('close', () => {
        webSocketClients.delete(userId);
        console.log(`Connexion WebSocket fermée pour l'utilisateur : ${userId}`);
      });
    } catch (err) {
      console.error('Erreur lors du décodage du token JWT :', err);
      ws.close();
    }
  });

  return wss;
}

// Diffuser un message en temps réel via WebSocket
function broadcastToUser(userId, message) {
  const ws = webSocketClients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// API pour envoyer un message
app.post('/envoyer', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { destinataire_id, message } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const expediteur_id = decoded.id;

    if (!destinataire_id || !message) {
      return res.status(400).json({ error: 'destinataire_id et message sont requis.' });
    }

    // Vérifier si les utilisateurs sont amis
    const checkAmisQuery = `
      SELECT * FROM Amis
      WHERE (utilisateur_id = $1 AND ami_id = $2 AND statut = 'ACCEPTE')
         OR (utilisateur_id = $2 AND ami_id = $1 AND statut = 'ACCEPTE');
    `;
    const amisResult = await client.query(checkAmisQuery, [expediteur_id, destinataire_id]);

    if (amisResult.rows.length === 0) {
      return res.status(403).json({ error: 'Vous ne pouvez envoyer des messages qu’à vos amis.' });
    }

    // Insérer le message dans la base de données
    const insertMessageQuery = `
      INSERT INTO Messagerie (expediteur_id, destinataire_id, message, date_envoye, statut)
      VALUES ($1, $2, $3, NOW(), 'ENVOYE')
      RETURNING *;
    `;
    const messageResult = await client.query(insertMessageQuery, [
      expediteur_id,
      destinataire_id,
      message,
    ]);

    // Diffuser le message au destinataire via WebSocket
    broadcastToUser(destinataire_id, messageResult.rows[0]);

    res.status(201).json({
      message: 'Message envoyé avec succès.',
      details: messageResult.rows[0],
    });
  } catch (err) {
    console.error('Erreur lors de l\'envoi du message :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

app.post('/historique', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { utilisateur_id } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const expediteur_id = decoded.id;

    if (!utilisateur_id) {
      return res.status(400).json({ error: 'utilisateur_id est requis.' });
    }

    // Vérifier si les utilisateurs sont amis
    const checkAmisQuery = `
      SELECT * FROM Amis
      WHERE (utilisateur_id = $1 AND ami_id = $2 AND statut = 'ACCEPTE')
         OR (utilisateur_id = $2 AND ami_id = $1 AND statut = 'ACCEPTE');
    `;
    const amisResult = await client.query(checkAmisQuery, [expediteur_id, utilisateur_id]);

    if (amisResult.rows.length === 0) {
      return res.status(403).json({ error: 'Vous ne pouvez consulter des messages qu’avec vos amis.' });
    }

    // Récupérer l'historique des messages
    const messagesQuery = `
      SELECT id, expediteur_id, destinataire_id, message, date_envoye
      FROM Messagerie
      WHERE (expediteur_id = $1 AND destinataire_id = $2)
         OR (expediteur_id = $2 AND destinataire_id = $1)
      ORDER BY date_envoye ASC;
    `;
    const messagesResult = await client.query(messagesQuery, [expediteur_id, utilisateur_id]);

    // Formater les messages pour inclure une distinction entre l'utilisateur connecté et l'autre
    const formattedMessages = messagesResult.rows.map(message => ({
      id: message.id,
      expediteur_id: message.expediteur_id,
      destinataire_id: message.destinataire_id,
      message: message.message,
      date_envoye: message.date_envoye,
      is_sent_by_me: message.expediteur_id === expediteur_id, // Indique si c'est envoyé par l'utilisateur connecté
    }));

    res.status(200).json({
      message: 'Historique des messages récupéré avec succès.',
      historique: formattedMessages,
    });
  } catch (err) {
    console.error('Erreur lors de la récupération des messages :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

app.post('/dernier-messages', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const utilisateur_id = decoded.id; // ID de l'utilisateur connecté

    // Récupérer le dernier message de chaque conversation avec les informations supplémentaires
    const derniersMessagesQuery = `
      SELECT 
        m1.id AS message_id,
        m1.expediteur_id,
        m1.destinataire_id,
        m1.message,
        m1.date_envoye,
        u.nom AS autre_utilisateur_nom,
        u.prenom AS autre_utilisateur_prenom,
        u.photo_de_profil,
        EXTRACT(EPOCH FROM (NOW() - m1.date_envoye)) AS temps_ecoule
      FROM Messagerie m1
      INNER JOIN (
        SELECT 
          GREATEST(expediteur_id, destinataire_id) AS pair_user_1,
          LEAST(expediteur_id, destinataire_id) AS pair_user_2,
          MAX(date_envoye) AS last_message_date
        FROM Messagerie
        WHERE expediteur_id = $1 OR destinataire_id = $1
        GROUP BY pair_user_1, pair_user_2
      ) m2 ON (
        GREATEST(m1.expediteur_id, m1.destinataire_id) = m2.pair_user_1 AND
        LEAST(m1.expediteur_id, m1.destinataire_id) = m2.pair_user_2 AND
        m1.date_envoye = m2.last_message_date
      )
      INNER JOIN Utilisateur u ON u.id = CASE
        WHEN m1.expediteur_id = $1 THEN m1.destinataire_id
        ELSE m1.expediteur_id
      END
      ORDER BY m1.date_envoye DESC;
    `;

    const derniersMessagesResult = await client.query(derniersMessagesQuery, [utilisateur_id]);

    // Formater la réponse pour inclure le temps écoulé en format lisible
    const formattedMessages = derniersMessagesResult.rows.map(message => {
      const secondsElapsed = Math.floor(message.temps_ecoule);
      let timeAgo;

      if (secondsElapsed < 60) {
        timeAgo = `${secondsElapsed} secondes`;
      } else if (secondsElapsed < 3600) {
        const minutes = Math.floor(secondsElapsed / 60);
        timeAgo = `${minutes} minute${minutes > 1 ? 's' : ''}`;
      } else if (secondsElapsed < 86400) {
        const hours = Math.floor(secondsElapsed / 3600);
        timeAgo = `${hours} heure${hours > 1 ? 's' : ''}`;
      } else {
        const days = Math.floor(secondsElapsed / 86400);
        timeAgo = `${days} jour${days > 1 ? 's' : ''}`;
      }

      return {
        message_id: message.message_id,
        id: message.expediteur_id === utilisateur_id ? message.destinataire_id : message.expediteur_id,
        nom: message.autre_utilisateur_nom,
        prenom: message.autre_utilisateur_prenom,
        photo_de_profil: message.photo_de_profil,
        message: message.message,
        date_envoye: message.date_envoye,
        temps_ecoule: timeAgo,
      };
    });

    // Retourner directement le tableau
    res.status(200).json(formattedMessages);
  } catch (err) {
    console.error('Erreur lors de la récupération des derniers messages :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});


app.post('/amis/demande', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { destinataire_id } = req.body; // ID de l'utilisateur destinataire

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const expediteur_id = decoded.id; // ID de l'utilisateur qui envoie la demande

    if (!destinataire_id) {
      return res.status(400).json({ error: 'L\'ID du destinataire est requis.' });
    }

    // Vérifier si une demande existe déjà ou si les utilisateurs sont déjà amis
    const checkExistingRequestQuery = `
      SELECT * FROM Amis 
      WHERE (utilisateur_id = $1 AND ami_id = $2)
         OR (utilisateur_id = $2 AND ami_id = $1)
    `;
    const existingRequest = await client.query(checkExistingRequestQuery, [expediteur_id, destinataire_id]);

    if (existingRequest.rows.length > 0) {
      return res.status(409).json({ error: 'Une demande d\'amis existe déjà ou vous êtes déjà amis.' });
    }

    // Créer une demande d'amis dans la table Amis avec statut "EN_ATTENTE"
    const createFriendRequestQuery = `
      INSERT INTO Amis (utilisateur_id, ami_id, statut)
      VALUES ($1, $2, 'EN_ATTENTE')
      RETURNING *;
    `;
    const friendRequest = await client.query(createFriendRequestQuery, [expediteur_id, destinataire_id]);

    // Créer une notification pour le destinataire de la demande d'amis
    const createNotificationQuery = `
      INSERT INTO Notifications (utilisateur_id, type, contenu, date_creation, statut)
      VALUES ($1, 'DEMANDE_AMIS', $2, NOW(), 'NON_LU')
      RETURNING *;
    `;
    const notificationContent = `Vous avez reçu une demande d'ami de l'utilisateur avec l'ID ${expediteur_id}.`;
    const notification = await client.query(createNotificationQuery, [destinataire_id, notificationContent]);

    res.status(201).json({
      message: 'Demande d\'amis envoyée avec succès.',
      demande: friendRequest.rows[0],
      notification: notification.rows[0],
    });
  } catch (err) {
    console.error('Erreur lors de l\'envoi de la demande d\'amis :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

app.post('/amis/reponse', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { notification_id, reponse } = req.body; // ID de la notification et réponse ("ACCEPTE" ou "REFUSE")

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const utilisateur_id = decoded.id; // ID de l'utilisateur connecté

    if (!notification_id || !reponse) {
      return res.status(400).json({ error: 'notification_id et reponse sont requis.' });
    }

    if (!['ACCEPTE', 'REFUSE'].includes(reponse.toUpperCase())) {
      return res.status(400).json({ error: 'La réponse doit être "ACCEPTE" ou "REFUSE".' });
    }

    // Vérifier si la notification existe et appartient à l'utilisateur connecté
    const checkNotificationQuery = `
      SELECT * 
      FROM Notifications 
      WHERE id = $1 AND utilisateur_id = $2 AND type = 'DEMANDE_AMIS';
    `;
    const notificationResult = await client.query(checkNotificationQuery, [notification_id, utilisateur_id]);

    if (notificationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Notification non trouvée ou invalide.' });
    }

    const notification = notificationResult.rows[0]; // La notification liée

    // Extraire l'expéditeur depuis le contenu de la notification
    const match = notification.contenu.match(/ID ([a-f0-9-]+)/);
    const expediteur_id = match ? match[1] : null;

    if (!expediteur_id) {
      return res.status(400).json({ error: 'Impossible de déterminer l\'expéditeur depuis la notification.' });
    }

    // Vérifier si la demande d'amis correspondante existe
    const checkFriendRequestQuery = `
      SELECT * 
      FROM Amis 
      WHERE (utilisateur_id = $1 AND ami_id = $2 AND statut = 'EN_ATTENTE')
         OR (utilisateur_id = $2 AND ami_id = $1 AND statut = 'EN_ATTENTE');
    `;
    const friendRequestResult = await client.query(checkFriendRequestQuery, [expediteur_id, utilisateur_id]);

    if (friendRequestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Demande d\'amis non trouvée ou déjà traitée.' });
    }

    const friendRequest = friendRequestResult.rows[0]; // La demande d'amis

    if (reponse.toUpperCase() === 'ACCEPTE') {
      // Accepter la demande : mettre à jour le statut de la relation à "ACCEPTE"
      const acceptRequestQuery = `
        UPDATE Amis
        SET statut = 'ACCEPTE'
        WHERE id = $1
        RETURNING *;
      `;
      const updatedRequest = await client.query(acceptRequestQuery, [friendRequest.id]);

      // Marquer la notification comme "LU"
      const markNotificationAsReadQuery = `
        UPDATE Notifications
        SET statut = 'LU'
        WHERE id = $1;
      `;
      await client.query(markNotificationAsReadQuery, [notification_id]);

      // Créer une notification pour informer l'expéditeur que la demande a été acceptée
      const createNotificationQuery = `
        INSERT INTO Notifications (utilisateur_id, type, contenu, date_creation, statut)
        VALUES ($1, 'DEMANDE_ACCEPTEE', $2, NOW(), 'NON_LU')
        RETURNING *;
      `;
      const acceptNotificationContent = `Votre demande d'ami à l'utilisateur avec l'ID ${utilisateur_id} a été acceptée. Vous êtes maintenant amis !`;
      const acceptNotification = await client.query(createNotificationQuery, [
        expediteur_id,
        acceptNotificationContent,
      ]);

      console.log('Notification d\'acceptation envoyée:', acceptNotification.rows[0]);

      return res.status(200).json({
        message: 'Demande d\'amis acceptée avec succès. Notification envoyée à l\'expéditeur.',
        details: updatedRequest.rows[0],
      });
    } else {
      // Refuser la demande : supprimer la relation dans la table Amis
      const deleteRequestQuery = `
        DELETE FROM Amis
        WHERE id = $1;
      `;
      await client.query(deleteRequestQuery, [friendRequest.id]);

      // Supprimer la notification associée
      const deleteNotificationQuery = `
        DELETE FROM Notifications
        WHERE id = $1;
      `;
      await client.query(deleteNotificationQuery, [notification_id]);

      // Créer une notification pour informer l'expéditeur que la demande a été refusée
      const createNotificationQuery = `
        INSERT INTO Notifications (utilisateur_id, type, contenu, date_creation, statut)
        VALUES ($1, 'DEMANDE_REFUSEE', $2, NOW(), 'NON_LU')
        RETURNING *;
      `;
      const refuseNotificationContent = `Votre demande d'ami à l'utilisateur avec l'ID ${utilisateur_id} a été refusée.`;
      const refuseNotification = await client.query(createNotificationQuery, [
        expediteur_id,
        refuseNotificationContent,
      ]);

      console.log('Notification de refus envoyée:', refuseNotification.rows[0]);

      return res.status(200).json({
        message: 'Demande d\'amis refusée et supprimée. Notification envoyée à l\'expéditeur.',
      });
    }
  } catch (err) {
    console.error('Erreur lors de la réponse à la demande d\'amis :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});



// Exporter le module WebSocket et l'application Express
module.exports = { app, setupWebSocket };

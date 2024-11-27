const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const client = require('./db'); // Connexion à la base de données
require('dotenv').config();

const app = express.Router(); // Utilisation de Router pour modulariser

const SALT_ROUNDS = 10; // Pour bcrypt
const SECRET_KEY = process.env.SECRET_KEY; // Assurez-vous que cette clé est définie dans votre fichier .env

// Route : Créer un utilisateur
app.post('/create', async (req, res) => {
  const { nom, prenom, email, mot_de_passe } = req.body;

  if (!nom || !prenom || !email || !mot_de_passe) {
    return res.status(400).json({ error: 'Tous les champs sont requis : nom, prenom, email, mot_de_passe.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'L\'adresse email fournie n\'est pas valide.' });
  }

  try {
    const checkEmailQuery = 'SELECT * FROM utilisateur WHERE email = $1';
    const emailExists = await client.query(checkEmailQuery, [email]);

    if (emailExists.rows.length > 0) {
      return res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà.' });
    }

    const hashedPassword = await bcryptjs.hash(mot_de_passe, SALT_ROUNDS);

    const insertQuery = `
      INSERT INTO utilisateur (nom, prenom, email, mot_de_passe)
      VALUES ($1, $2, $3, $4)
      RETURNING id, nom, prenom, email
    `;
    const result = await client.query(insertQuery, [nom, prenom, email, hashedPassword]);

    const newUser = result.rows[0];
    res.status(201).json({
      message: 'Utilisateur créé avec succès.',
      utilisateur: newUser,
    });
  } catch (err) {
    console.error('Erreur lors de la création de l\'utilisateur', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

// Route : Mettre à jour un utilisateur
app.put('/update', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const updateData = req.body;

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const userId = decoded.id;

    const checkUserQuery = 'SELECT * FROM utilisateur WHERE id = $1';
    const userExists = await client.query(checkUserQuery, [userId]);

    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    const filteredData = Object.entries(updateData).reduce((acc, [key, value]) => {
      if (value !== '' && value !== null) {
        acc[key] = value;
      }
      return acc;
    }, {});

    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({ error: 'Aucune donnée valide à mettre à jour.' });
    }

    const fields = [];
    const values = [];
    let query = 'UPDATE utilisateur SET ';

    Object.entries(filteredData).forEach(([key, value], index) => {
      fields.push(`${key} = $${index + 1}`);
      values.push(value);
    });

    query += fields.join(', ') + ' WHERE id = $' + (fields.length + 1) + ' RETURNING *';
    values.push(userId);

    const result = await client.query(query, values);

    res.status(200).json({
      message: 'Informations utilisateur mises à jour avec succès.',
      utilisateur: result.rows[0],
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalide. Accès non autorisé.' });
    }
    console.error('Erreur lors de la mise à jour de l\'utilisateur', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

// Route : Supprimer un utilisateur
app.delete('/delete', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const userId = decoded.id;

    const checkUserQuery = 'SELECT * FROM utilisateur WHERE id = $1';
    const userExists = await client.query(checkUserQuery, [userId]);

    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    const deleteUserQuery = 'DELETE FROM utilisateur WHERE id = $1';
    await client.query(deleteUserQuery, [userId]);

    res.status(200).json({
      message: 'Utilisateur supprimé avec succès.',
      utilisateur_id: userId,
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalide. Accès non autorisé.' });
    }
    console.error('Erreur lors de la suppression de l\'utilisateur :', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

// Route : Voir les informations d’un utilisateur
app.post('/info', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { utilisateur_id } = req.body; // ID de l'utilisateur cible passé dans le body

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  if (!utilisateur_id) {
    return res.status(400).json({ error: 'utilisateur_id est requis.' });
  }

  try {
    // Vérifier et décoder le token
    const decoded = jwt.verify(token, SECRET_KEY);
    const expediteur_id = decoded.id; // ID de l'utilisateur connecté

    // Vérifier si l'utilisateur cible existe
    const userQuery = `
      SELECT id, nom, prenom, email, date_creation
      FROM utilisateur
      WHERE id = $1
    `;
    const userResult = await client.query(userQuery, [utilisateur_id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    // Retourner les informations de l'utilisateur cible
    const userInfo = userResult.rows[0];
    res.status(200).json({
      message: 'Informations utilisateur récupérées avec succès.',
      utilisateur: userInfo,
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalide. Accès non autorisé.' });
    }
    console.error("Erreur lors de la récupération des informations de l'utilisateur :", err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});


module.exports = app; 
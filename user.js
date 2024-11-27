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

app.post('/infos', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { utilisateur_id } = req.body;

  console.log('Token reçu :', token);
  console.log('ID utilisateur reçu :', utilisateur_id);

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  if (!utilisateur_id) {
    return res.status(400).json({ error: 'utilisateur_id est requis.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    console.log('ID utilisateur connecté :', decoded.id);

    // Requête SQL pour récupérer toutes les colonnes sauf le mot de passe
    const userQuery = `
      SELECT
        id, nom, prenom, photo_de_profil, bio, photo_feed, email, linkedin,
        instagram, facebook, date_inscription, date_de_naissance, code_postale,
        adresse_postale, nom_d_entreprise, adresse_entreprise, site,
        activite_entreprise, domaine_activite, tags
      FROM utilisateur
      WHERE id = $1
    `;
    const userResult = await client.query(userQuery, [utilisateur_id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    const userInfo = userResult.rows[0];

    // Gestion de photo_feed comme tableau (si stocké sous forme JSON ou tableau)
    const photoFeed = Array.isArray(userInfo.photo_feed)
      ? userInfo.photo_feed
      : JSON.parse(userInfo.photo_feed || '[]');

    // Limitation à 9 photos pour photo_feed
    const limitedPhotoFeed = photoFeed.slice(0, 9);

    res.status(200).json({
      message: 'Informations utilisateur récupérées avec succès.',
      utilisateur: {
        id: userInfo.id,
        nom: userInfo.nom,
        prenom: userInfo.prenom,
        photo_de_profil: userInfo.photo_de_profil,
        bio: userInfo.bio,
        photo_feed: limitedPhotoFeed,
        email: userInfo.email,
        linkedin: userInfo.linkedin,
        instagram: userInfo.instagram,
        facebook: userInfo.facebook,
        date_inscription: userInfo.date_inscription,
        date_de_naissance: userInfo.date_de_naissance,
        code_postale: userInfo.code_postale,
        adresse_postale: userInfo.adresse_postale,
        nom_d_entreprise: userInfo.nom_d_entreprise,
        adresse_entreprise: userInfo.adresse_entreprise,
        site: userInfo.site,
        activite_entreprise: userInfo.activite_entreprise,
        domaine_activite: userInfo.domaine_activite,
        tags: userInfo.tags,
      },
    });
  } catch (err) {
    console.error('Erreur serveur :', err);
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalide. Accès non autorisé.' });
    }
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});


app.get('/search', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]; // Récupérer le token du header Authorization
  const query = req.query.q; // Le paramètre de recherche
  const page = parseInt(req.query.page) || 1; // Page par défaut : 1
  const limit = parseInt(req.query.limit) || 10; // Nombre de résultats par page par défaut : 10
  const offset = (page - 1) * limit; // Calcul pour l'offset

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  if (!query || query.trim() === '') {
    return res.status(400).json({ error: 'Le paramètre de recherche "q" est requis.' });
  }

  try {
    // Vérification du token JWT
    const decoded = jwt.verify(token, SECRET_KEY);
    const userId = decoded.id; // ID de l'utilisateur connecté (issu du token)
    
    console.log(`Utilisateur connecté : ${userId}`);

    // Recherche dans la table "utilisateur" avec pagination
    const utilisateursQuery = `
      SELECT id, nom, prenom, email 
      FROM utilisateur
      WHERE nom ILIKE $1 OR prenom ILIKE $1 OR email ILIKE $1
      LIMIT $2 OFFSET $3
    `;
    const utilisateurs = await client.query(utilisateursQuery, [`%${query}%`, limit, offset]);

    // Recherche dans la table "evenement" avec pagination
    const evenementsQuery = `
      SELECT id, titre, description, lieu, date, heure 
      FROM evenement
      WHERE titre ILIKE $1 OR description ILIKE $1 OR lieu ILIKE $1
      LIMIT $2 OFFSET $3
    `;
    const evenements = await client.query(evenementsQuery, [`%${query}%`, limit, offset]);

    // Retourner les résultats avec pagination
    res.status(200).json({
      message: 'Recherche effectuée avec succès.',
      utilisateurs: utilisateurs.rows,
      evenements: evenements.rows,
      pagination: {
        page,
        limit,
        utilisateurs_count: utilisateurs.rowCount, // Nombre de résultats dans cette page pour les utilisateurs
        evenements_count: evenements.rowCount, // Nombre de résultats dans cette page pour les événements
      },
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalide. Accès non autorisé.' });
    }
    console.error('Erreur lors de la recherche :', err);
    res.status(500).json({ error: 'Erreur serveur lors de la recherche.' });
  }
});


module.exports = app; 
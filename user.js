const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const client = require('./db'); // Connexion à la base de données
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const SALT_ROUNDS = 10; // Pour bcrypt

app.post('/utilisateur/create', async (req, res) => {
  const { nom, prenom, email, mot_de_passe } = req.body;

  // Vérification des champs requis
  if (!nom || !prenom || !email || !mot_de_passe) {
    return res.status(400).json({ error: 'Tous les champs sont requis : nom, prenom, email, mot_de_passe.' });
  }

  try {
    // Vérifier si l'email existe déjà
    const checkEmailQuery = 'SELECT * FROM utilisateur WHERE email = $1';
    const emailExists = await client.query(checkEmailQuery, [email]);

    if (emailExists.rows.length > 0) {
      return res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà.' });
    }

    // Hachage du mot de passe
    const hashedPassword = await bcrypt.hash(mot_de_passe, SALT_ROUNDS);

    // Insertion de l'utilisateur dans la base de données
    const insertQuery = `
      INSERT INTO utilisateur (nom, prenom, email, mot_de_passe)
      VALUES ($1, $2, $3, $4)
      RETURNING id, nom, prenom, email
    `;
    const result = await client.query(insertQuery, [nom, prenom, email, hashedPassword]);

    // Retourner l'utilisateur nouvellement créé (sans mot de passe)
    const newUser = result.rows[0];
    res.status(201).json({
      message: 'Utilisateur créé avec succès.',
      utilisateur: newUser,
    });
  } catch (err) {
    console.error('Erreur lors de la création de l\'utilisateur', err);
    res.status(500).send('Erreur du serveur');
  }
});

const jwt = require('jsonwebtoken'); // Assurez-vous d'avoir cette bibliothèque pour le décodage JWT

app.put('/utilisateur/update', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]; // Récupérer le token depuis l'en-tête Authorization
  const updateData = req.body; // Données mises à jour fournies par le client
  const SECRET_KEY = process.env.SECRET_KEY;

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    // Décoder le token JWT pour récupérer l'ID utilisateur
    const decoded = jwt.verify(token, SECRET_KEY);
    const userId = decoded.id;

    // Vérifier si l'utilisateur existe
    const checkUserQuery = 'SELECT * FROM utilisateur WHERE id = $1';
    const userExists = await client.query(checkUserQuery, [userId]);

    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    // Filtrer les champs pour ignorer les valeurs vides ou nulles
    const filteredData = Object.entries(updateData).reduce((acc, [key, value]) => {
      if (value !== '' && value !== null) {
        acc[key] = value; // Ajouter uniquement les champs valides
      }
      return acc;
    }, {});

    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({ error: 'Aucune donnée valide à mettre à jour.' });
    }

    // Construire dynamiquement la requête SQL pour ne mettre à jour que les champs valides
    const fields = [];
    const values = [];
    let query = 'UPDATE utilisateur SET ';

    Object.entries(filteredData).forEach(([key, value], index) => {
      fields.push(`${key} = $${index + 1}`);
      values.push(value);
    });

    query += fields.join(', ') + ' WHERE id = $' + (fields.length + 1) + ' RETURNING *';
    values.push(userId); // Ajouter l'ID utilisateur pour la clause WHERE

    // Exécuter la requête
    const result = await client.query(query, values);

    res.status(200).json({
      message: 'Informations utilisateur mises à jour avec succès.',
      utilisateur: result.rows[0], // Retourner les informations mises à jour
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalide. Accès non autorisé.' });
    }
    console.error('Erreur lors de la mise à jour de l\'utilisateur', err);
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});



app.delete('/utilisateur/delete/:id', async (req, res) => {
  const { id } = req.params; // ID de l'utilisateur à supprimer

  try {
    // Vérifier si l'utilisateur existe
    const checkUserQuery = 'SELECT * FROM utilisateur WHERE id = $1';
    const userExists = await client.query(checkUserQuery, [id]);

    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    // Supprimer l'utilisateur
    const deleteUserQuery = 'DELETE FROM utilisateur WHERE id = $1';
    await client.query(deleteUserQuery, [id]);

    res.status(200).json({
      message: 'Utilisateur supprimé avec succès.',
      utilisateur_id: id,
    });
  } catch (err) {
    console.error('Erreur lors de la suppression de l\'utilisateur', err);
    res.status(500).send('Erreur du serveur');
  }
});


// Lancer le serveur
const port = 3000;
app.listen(port, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${port}`);
});

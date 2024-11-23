const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const client = require('./db'); // Connexion à la base de données
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const SALT_ROUNDS = 10; // Pour bcrypt

app.post('/utilisateur', async (req, res) => {
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

app.put('/utilisateur/:id', async (req, res) => {
  const { id } = req.params; // ID de l'utilisateur à mettre à jour
  const updateData = req.body; // Données mises à jour fournies par le client

  // Vérifier que l'utilisateur existe
  try {
    const checkUserQuery = 'SELECT * FROM utilisateur WHERE id = $1';
    const userExists = await client.query(checkUserQuery, [id]);

    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    // Construire dynamiquement la requête SQL pour ne mettre à jour que les champs fournis
    const fields = [];
    const values = [];
    let query = 'UPDATE utilisateur SET ';

    Object.entries(updateData).forEach(([key, value], index) => {
      fields.push(`${key} = $${index + 1}`);
      values.push(value);
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour.' });
    }

    query += fields.join(', ') + ' WHERE id = $' + (fields.length + 1) + ' RETURNING *';
    values.push(id); // Ajouter l'ID comme dernière valeur pour la clause WHERE

    const result = await client.query(query, values);

    res.status(200).json({
      message: 'Informations utilisateur mises à jour avec succès.',
      utilisateur: result.rows[0],
    });
  } catch (err) {
    console.error('Erreur lors de la mise à jour de l\'utilisateur', err);
    res.status(500).send('Erreur du serveur');
  }
});

app.delete('/utilisateur/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { id } = req.params; // ID fourni dans l'URL

  if (!token) {
    return res.status(401).json({ error: 'Token non fourni. Accès non autorisé.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);

    // Vérifier si l'ID dans le token correspond à l'ID fourni
    if (decoded.id !== id) {
      return res.status(403).json({ error: 'Action non autorisée.' });
    }

    const checkUserQuery = 'SELECT * FROM utilisateur WHERE id = $1';
    const userExists = await client.query(checkUserQuery, [id]);

    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    const deleteUserQuery = 'DELETE FROM utilisateur WHERE id = $1';
    await client.query(deleteUserQuery, [id]);

    res.status(200).json({
      message: 'Utilisateur supprimé avec succès.',
      utilisateur_id: id,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur du serveur.' });
  }
});

// Lancer le serveur
const port = 3000;
app.listen(port, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${port}`);
});

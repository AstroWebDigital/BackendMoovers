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

// Lancer le serveur
const port = 3000;
app.listen(port, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${port}`);
});

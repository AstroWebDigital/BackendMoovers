const express = require('express');
const bodyParser = require('body-parser');
const client = require('./db');


const app = express();
app.use(bodyParser.json());

require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY;

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }
  try {
    const query = 'SELECT * FROM utilisateur WHERE email = $1';
    const result = await client.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '1h' });

    res.json({ message: 'Connexion réussie.', token });
  } catch (err) {
    console.error('Erreur lors de l\'authentification', err);
    res.status(500).send('Erreur du serveur');
  }
});


app.get('/utilisateur', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM utilisateur');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur lors de la récupération des utilisateurs', err);
    res.status(500).send('Erreur du serveur');
  }
});

// Lancer le serveur sur le port 3000 avec node server.js
const port = 3000;
app.listen(port, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${port}`);
});

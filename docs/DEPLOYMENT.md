# Guide de Déploiement QUOKKA

## Configuration de l'Environnement

### Variables d'Environnement Requises

#### Backend (.env)
```env
# Base de données
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quokka_db
DB_USER=quokka_user
DB_PASSWORD=votre_mot_de_passe_securise

# JWT
JWT_SECRET=votre_secret_jwt_tres_long_et_securise
JWT_REFRESH_SECRET=votre_refresh_secret_jwt

# Email (optionnel)
SMTP_HOST=smtp.votre-domaine.com
SMTP_PORT=587
SMTP_USER=votre-email@domaine.com
SMTP_PASS=votre-mot-de-passe-email

# Stripe (optionnel)
STRIPE_SECRET_KEY=sk_test_votre_cle_secrete_stripe
STRIPE_WEBHOOK_SECRET=whsec_votre_webhook_secret

# Redis (optionnel)
REDIS_URL=redis://localhost:6379

# URL Frontend
FRONTEND_URL=http://localhost:5173
```

#### Frontend (.env)
```env
VITE_API_URL=http://localhost:3000
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_votre_cle_publique_stripe
```

## Scripts de Déploiement

### Backend
```bash
# Installation des dépendances
npm install

# Build pour la production
npm run build

# Lancer le serveur
npm start
```

### Frontend
```bash
# Installation des dépendances
npm install

# Build pour la production
npm run build

# Prévisualiser le build
npm run preview
```

## Docker (Optionnel)

Voir le dossier `infra/` pour les configurations Docker.
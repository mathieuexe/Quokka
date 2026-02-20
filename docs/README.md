# QUOKKA - Plateforme de Chat Multi-Serveurs

QUOKKA est une plateforme de chat multi-serveurs moderne avec support multi-langues, modération avancée et système de paiement intégré.

## 🚀 Fonctionnalités

- **Chat Multi-Serveurs**: Créez et gérez plusieurs serveurs de chat
- **Modération Avancée**: Système complet de modération avec rôles et permissions
- **Multi-Langues**: Support de 11 langues (FR, EN, ES, DE, IT, PT, RU, UK, JA, HI, ZH)
- **Système de Paiement**: Intégration Stripe pour les abonnements premium
- **Administration**: Interface d'administration complète
- **Authentification**: Support 2FA et SSO (Authentik)
- **Responsive**: Interface adaptative pour tous les appareils

## 📋 Prérequis

- Node.js 18+ 
- PostgreSQL 14+
- Redis (optionnel, pour la mise en cache)
- Docker (optionnel, pour l'infrastructure)

## 🛠️ Installation

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Configurez votre .env avec vos variables
db npm run dev
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## 📁 Structure du Projet

```
QUOKKA/
├── backend/          # API Node.js/TypeScript
├── frontend/         # React/TypeScript avec Vite
├── bot/             # Bot Discord/Node.js
├── infra/           # Configuration Docker/Infrastructure
└── docs/            # Documentation publique
```

## 🌿 Branches Git

- **main**: Branche de développement (peut être instable)
- **prod**: Branche de production (stable)
- **gh-pages**: Documentation publique

## 🔒 Sécurité

- Les fichiers `.env` ne doivent jamais être commités
- Les fichiers `.sql` sont exclus du dépôt pour la sécurité
- Utilisez toujours des variables d'environnement pour les données sensibles

## 📄 Licence

Ce projet est sous licence privée.
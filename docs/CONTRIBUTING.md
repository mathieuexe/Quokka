# Guide de Contribution QUOKKA

## 🎯 Objectif

QUOKKA est un projet open-source visant à créer une plateforme de chat multi-serveurs moderne et sécurisée.

## 📝 Processus de Contribution

### 1. Fork et Clone
```bash
# Fork le dépôt sur GitHub
# Clone votre fork
git clone https://github.com/votre-username/quokka.git
cd quokka
```

### 2. Branches de Développement
```bash
# Créer une branche feature
git checkout -b feature/nom-de-la-fonctionnalite

# ou une branche de correction
git checkout -b fix/description-du-bug
```

### 3. Standards de Code

- **Backend**: TypeScript avec ESLint et Prettier
- **Frontend**: React/TypeScript avec ESLint
- **Commits**: Utilisez des messages clairs et descriptifs
- **Tests**: Ajoutez des tests pour les nouvelles fonctionnalités

### 4. Soumettre une Pull Request

1. Push votre branche sur votre fork
2. Créez une Pull Request vers la branche `main`
3. Décrivez clairement les changements
4. Attendez la review

## 🧪 Tests

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

## 📞 Support

Pour les questions ou le support, ouvrez une issue sur GitHub.
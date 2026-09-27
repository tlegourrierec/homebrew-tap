#!/bin/bash
cd "$(dirname "$0")"
if ! command -v npm >/dev/null; then
  echo "Node.js n'est pas installé. Installe-le depuis https://nodejs.org (bouton LTS), puis relance ce fichier."
  open https://nodejs.org; read -p "Appuie sur Entrée pour fermer"; exit 1
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Colle ta clé Gemini (https://aistudio.google.com/apikey) puis appuie sur Entrée :"
  read KEY
  sed -i '' "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$KEY|" .env
fi
[ -d node_modules ] || npm install
(sleep 3; open http://localhost:3000) &
npm start

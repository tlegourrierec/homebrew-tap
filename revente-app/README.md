# Revente — version 1

Tu prends des photos d'un objet, l'app :
1. l'identifie précisément (marque, modèle, référence, taille, état, défauts) ;
2. cherche sur le web des objets identiques ou quasi identiques, en vente ou déjà vendus ;
3. te donne 3 prix : vente rapide, optimal, haut, avec les comparables cliquables ;
4. rédige une annonce adaptée à chaque site (Vinted, Leboncoin, eBay, et d'autres si c'est pertinent) ;
5. suit tes annonces (publiée / vendue) et t'envoie une notification Telegram.

## Installation (une seule fois)

1. Installe **Node.js** (version 20 ou plus) : https://nodejs.org → bouton « LTS ».
2. Décompresse `revente-app.zip` (par exemple dans Téléchargements).
3. Crée une clé API sur https://console.anthropic.com → *API Keys* (il faut ajouter quelques euros de crédit).
4. Dans le dossier `revente-app`, copie `.env.example` et renomme la copie en `.env`, puis colle ta clé après `ANTHROPIC_API_KEY=`.
5. Ouvre un terminal dans le dossier et lance :
   ```
   npm install
   npm start
   ```

Le terminal affiche deux adresses :
- `http://localhost:3000` pour l'ordinateur ;
- `http://192.168.x.x:3000` pour ton téléphone, qui doit être sur le même Wi-Fi.

Pour les fois suivantes, seul `npm start` suffit.
Si le téléphone n'arrive pas à se connecter, autorise Node.js dans le pare-feu de l'ordinateur.

## Notifications sur le téléphone (facultatif)

1. Dans Telegram, écris à **@BotFather** → `/newbot` → il te donne un *token*.
2. Envoie un message à ton nouveau bot, puis ouvre `https://api.telegram.org/bot<TOKEN>/getUpdates` pour lire ton `chat id`.
3. Remplis `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` dans `.env`, puis relance `npm start`.

## Coût

Chaque analyse fait des recherches web et utilise l'API Claude : compte **quelques dizaines de centimes par objet**. Le coût réel est visible dans la console Anthropic.

## Limites de cette version

- **Publication** : pour l'instant, l'app prépare tout et ouvre le site. Tu colles le titre et la description (boutons « Copier »), tu ajoutes les photos et tu publies. Vinted et Leboncoin n'ont pas d'API publique : les automatiser ferait risquer une suspension de ton compte.
- **Suivi** : tu colles le lien de l'annonce et tu cliques « Marquer publiée », puis « Marquer vendue ».
- **Prochaines étapes prévues** : publication automatique sur eBay via son API officielle, et détection automatique des emails « publiée » et « vendu » de Vinted et Leboncoin.

Les données (photos, analyses) restent sur ton ordinateur, dans le dossier `data/`.

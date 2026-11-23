# NOVA

Assistant personnel vocal dans le navigateur : il te reconnaît par la caméra, tu dis **« Bonjour »** et il te fait le briefing du jour (heure, météo, agenda) avec une voix fluide et un orbe holographique animé.

## Utilisation
1. Ouvre la page (Chrome ou Edge conseillés, Safari possible) et touche **Activer NOVA**.
2. Autorise le micro, la caméra et la localisation.
3. ⚙ Réglages : ton prénom, comment NOVA t'appelle, **Enregistrer mon visage**, ta ville (facultatif).
4. Dis « Bonjour ». Ensuite tu peux parler librement ou commencer par « Nova, … ».
   - « Nova, quel temps fait-il ? »
   - « Nova, qu'est-ce que j'ai demain ? »
   - « Nova, ajoute dentiste demain à 15 h à mon agenda »

## Voix neuronale et conversation (optionnel)
Ajoute une clé OpenAI dans les réglages : voix neuronale (6 voix), briefing rédigé par l'IA et conversation libre.
La clé reste dans ton navigateur et n'est envoyée qu'à api.openai.com. Mets une limite de dépenses sur ton compte OpenAI.
Sans clé, NOVA utilise la voix du navigateur et répond à l'heure, la météo et l'agenda.

## Vie privée
Le visage est transformé en empreintes numériques stockées uniquement dans ce navigateur (localStorage). Rien n'est envoyé.
Un visage inconnu n'a pas accès à l'agenda.

## Mise en ligne (GitHub Pages)
Settings → Pages → Source : **Deploy from a branch**, branche **main**, dossier **/ (root)** → Save.
Adresse : `https://<ton-compte>.github.io/nova2/`

Briques utilisées : face-api (@vladmandic), Open-Meteo, Web Speech API, OpenAI (optionnel).

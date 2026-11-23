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

## Gratuit : intelligence avec Groq
Crée une clé gratuite sur https://console.groq.com/keys et colle-la (gsk_…) dans les réglages :
conversation libre et briefing rédigé par l'IA, avec la voix de l'appareil.

Pour une voix plus naturelle sur iPad/iPhone : Réglages → Accessibilité → Contenu énoncé → Voix → Français →
télécharge une voix « améliorée » ou « premium », puis choisis-la dans les réglages de NOVA.

## Payant (optionnel) : voix neuronale OpenAI
Une clé OpenAI (sk-…) ajoute la voix neuronale (6 voix). Mets une limite de dépenses sur ton compte.
Les clés restent dans ton navigateur et ne partent que vers l'API concernée.

## Vie privée
Le visage est transformé en empreintes numériques stockées uniquement dans ce navigateur (localStorage). Rien n'est envoyé.
Un visage inconnu n'a pas accès à l'agenda.

## Mise en ligne (GitHub Pages)
Settings → Pages → Source : **Deploy from a branch**, branche **main**, dossier **/ (root)** → Save.
Adresse : `https://<ton-compte>.github.io/nova2/`

Briques utilisées : face-api (@vladmandic), Open-Meteo, Web Speech API, OpenAI (optionnel).

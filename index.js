require('dotenv').config(); // Charger le fichier .env

const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { Player } = require('discord-player');
const axios = require('axios');

// 🔑 Variables depuis .env
const token = process.env.DISCORD_TOKEN;
const newsApiKey = process.env.NEWS_API_KEY;
const meteoApiKey = process.env.METEO_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

// 🎛️ Création du client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

// 🎵 Initialisation du Player pour la musique
const player = new Player(client);

// ⚙️ Variables globales
const prefix = '!';
let chatSessionActive = false;

// 🔔 Event ready
client.once('ready', async () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);

    // Création salon "commandes-bot" si inexistant et envoi message dans "général"
    client.guilds.cache.forEach(async (guild) => {
        try {
            let commandChannel = guild.channels.cache.find(ch => ch.name === "commandes-bot");
            if (!commandChannel) {
                commandChannel = await guild.channels.create({
                    name: "commandes-bot",
                    type: 0,
                    permissionOverwrites: [
                        { id: guild.roles.everyone.id, allow: ["ViewChannel","ReadMessageHistory"], deny: ["SendMessages"] },
                        { id: client.user.id, allow: ["ViewChannel","SendMessages"] }
                    ]
                });

                await commandChannel.send(
                    "📌 **Liste des commandes du bot :**\n\n" +
                    "🛠️ **Modération**\n" +
                    "`!mute @user X` → Mute un membre pour X minutes.\n" +
                    "`!unmute @user` → Unmute un membre.\n" +
                    "`!kick @user` → Expulse un membre.\n" +
                    "`!ban @user` → Bannit un membre.\n" +
                    "`!clear X` → Supprime X messages dans le chat.\n\n" +
                    "🎵 **Musique**\n" +
                    "`!play [titre/url]` → Joue une musique.\n" +
                    "`!pause` → Met en pause.\n" +
                    "`!resume` → Reprend la musique.\n" +
                    "`!stop` → Arrête la musique.\n" +
                    "`!skip` → Passe à la musique suivante.\n\n" +
                    "💬 **ChatGPT**\n" +
                    "`!u up` → Active la discussion avec ChatGPT.\n" +
                    "`!stop` → Arrête la session ChatGPT.\n\n" +
                    "📢 **Autres**\n" +
                    "`!weather [ville]` → Donne la météo.\n" +
                    "`!news` → Affiche les dernières actualités.\n" +
                    "`!userinfo @user` → Affiche les infos d'un membre.\n\n" +
                    "🔥 **Amuse-toi bien !**"
                );
            }

            let generalChannel = guild.channels.cache.find(ch => ch.name.toLowerCase() === "général");
            if (!generalChannel) {
                generalChannel = guild.channels.cache
                    .filter(ch => ch.isTextBased() && ch.permissionsFor(client.user).has("SendMessages"))
                    .sort((a,b)=>a.position-b.position)
                    .first();
            }
            if (generalChannel) generalChannel.send('Salut les loulous 👋 !');
        } catch (err) {
            console.error(`Erreur lors de l'initialisation des salons dans ${guild.name}:`, err);
        }
    });
});

// 👥 Event membre rejoint
client.on('guildMemberAdd', (member) => {
    member.send("Bienvenue dans le serveur !").catch(err => console.error(err));
    const channel = member.guild.channels.cache.find(ch => ch.name === 'general');
    if (channel) channel.send(`@${member.user.tag}, bienvenue !`);
});

// 💬 Gestion des commandes
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const keywords = ['ali','quentin','juan'];
    if (keywords.some(k=>message.content.toLowerCase().includes(k))) {
        message.channel.send('the best');
        return;
    }

    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    // ChatGPT session
    if (command === 'u' && args[0] === 'up') {
        chatSessionActive = true;
        message.channel.send(`Salut ${message.author.username}, que puis-je faire pour vous ?`);
        return;
    }
    if (command === 'stop') {
        if (chatSessionActive) {
            chatSessionActive = false;
            message.channel.send(`Session terminée. À bientôt, ${message.author.username} !`);
        } else {
            message.channel.send('Aucune session active.');
        }
        return;
    }
    if (chatSessionActive) {
        try {
            const gptResponse = await getChatGPTResponse(message.content);
            message.channel.send(gptResponse);
        } catch(err) {
            console.error(err);
            message.channel.send('Erreur avec ChatGPT.');
        }
        return;
    }

    // Weather
    if (command==='weather') {
        const ville = args.join(' ');
        if(!ville) return message.channel.send('❌ Veuillez indiquer une ville.');
        try {
            const url = `https://api.meteo-concept.com/api/forecast/daily?token=${meteoApiKey}&insee=${encodeURIComponent(ville)}`;
            const res = await axios.get(url);
            const forecast = res.data.forecast?.[0];
            if(forecast) {
                message.channel.send(`🌦 Météo pour ${ville} : Tmin ${forecast.tmin}°C, Tmax ${forecast.tmax}°C, Prévisions : ${forecast.weather}`);
            } else {
                message.channel.send('❌ Pas de données météo.');
            }
        } catch(err) { console.error(err); message.channel.send('❌ Erreur météo.'); }
    }

    // News
    if (command==='news') {
        try {
            const url = `https://newsapi.org/v2/top-headlines?country=fr&apiKey=${newsApiKey}`;
            const res = await axios.get(url);
            const articles = res.data.articles.slice(0,3);
            if(!articles.length) return message.channel.send('Aucune actualité récente.');
            let newsMessage = '**Dernières actualités :**\n';
            articles.forEach((a,i)=> newsMessage+=`\n**${i+1}. ${a.title}**\n${a.description||'Pas de description.'}\n[Lire l'article](${a.url})\n`);
            message.channel.send(newsMessage);
        } catch(err) { console.error(err); message.channel.send('❌ Erreur actualités.'); }
    }

    // ----- MODÉRATION -----
    if (command === "mute") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.channel.send("❌ Vous n'avez pas la permission de mute.");
        }
        const member = message.mentions.members.first();
        if (!member) return message.channel.send("❌ Veuillez mentionner un utilisateur à mute.");
        const duration = parseInt(args[1]);
        if (isNaN(duration) || duration <= 0) return message.channel.send("❌ Spécifiez une durée en minutes. Exemple : `!mute @utilisateur 10`");
        try {
            await member.timeout(duration * 60 * 1000, "Mute par un modérateur");
            message.channel.send(`🔇 **${member.user.tag}** a été mute pour ${duration} minutes.`);
        } catch (err) {
            console.error(err);
            message.channel.send("❌ Impossible de mute cet utilisateur. Vérifiez mes permissions !");
        }
    }
    if (command === "unmute") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.channel.send("❌ Vous n'avez pas la permission d'unmute.");
        }
        const member = message.mentions.members.first();
        if (!member) return message.channel.send("❌ Veuillez mentionner un utilisateur à unmute.");
        if (member.communicationDisabledUntilTimestamp === null) {
            return message.channel.send("❌ Cet utilisateur n'est pas mute.");
        }
        try {
            await member.timeout(null);
            message.channel.send(`🔊 **${member.user.tag}** a été unmute.`);
        } catch (err) {
            console.error(err);
            message.channel.send("❌ Impossible d'unmute cet utilisateur. Vérifiez mes permissions !");
        }
    }
    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.channel.send("❌ Vous n'avez pas la permission de supprimer des messages.");
        }
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0 || amount > 100) {
            return message.channel.send("❌ Spécifiez un nombre de messages à supprimer (entre 1 et 100).");
        }
        try {
            const fetched = await message.channel.messages.fetch({ limit: amount });
            const filtered = fetched.filter(msg => (Date.now() - msg.createdTimestamp) < 14 * 24 * 60 * 60 * 1000);
            if (filtered.size === 0) {
                return message.channel.send("❌ Aucun message supprimable (plus de 14 jours).");
            }
            await message.channel.bulkDelete(filtered, true);
            message.channel.send(`🧹 **${filtered.size} messages ont été supprimés.**`).then(msg => {
                setTimeout(() => msg.delete(), 3000);
            });
        } catch (err) {
            console.error(err);
            message.channel.send("❌ Une erreur est survenue lors de la suppression des messages.");
        }
    }
    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.channel.send('❌ Vous n\'avez pas la permission de kick.');
        }
        const member = message.mentions.members.first();
        if (!member) return message.channel.send('❌ Veuillez mentionner un utilisateur à kick.');
        if (!member.kickable) return message.channel.send('❌ Je ne peux pas kick cet utilisateur.');
        try {
            await member.kick();
            message.channel.send(`✅ **${member.user.tag}** a été kick avec succès.`);
        } catch (err) {
            console.error(err);
            message.channel.send('❌ Une erreur est survenue en essayant de kick cet utilisateur.');
        }
    }
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.channel.send('❌ Vous n\'avez pas la permission de bannir.');
        }
        const member = message.mentions.members.first();
        if (!member) return message.channel.send('❌ Veuillez mentionner un utilisateur à bannir.');
        if (!member.bannable) return message.channel.send('❌ Je ne peux pas bannir cet utilisateur.');
        try {
            await member.ban();
            message.channel.send(`✅ **${member.user.tag}** a été banni avec succès.`);
        } catch (err) {
            console.error(err);
            message.channel.send('❌ Une erreur est survenue en essayant de bannir cet utilisateur.');
        }
    }

    // ----- MUSIQUE -----
    if (command === 'play') {
        const query = args.join(' ');
        if (!query) return message.channel.send('❌ Veuillez fournir un titre ou une URL YouTube.');
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.channel.send('❌ Vous devez être dans un salon vocal pour jouer de la musique.');
        try {
            const searchResult = await player.search(query, { requestedBy: message.author });
            if (!searchResult || !searchResult.tracks.length) {
                return message.channel.send('❌ Aucun résultat trouvé pour votre requête.');
            }
            const queue = await player.createQueue(message.guild, { metadata: { channel: message.channel } });
            if (!queue.connection) await queue.connect(voiceChannel);
            queue.addTrack(searchResult.tracks[0]);
            if (!queue.playing) await queue.play();
            message.channel.send(`🎶 Lecture en cours : **${searchResult.tracks[0].title}**`);
        } catch (err) {
            console.error(err);
            message.channel.send('❌ Une erreur est survenue en essayant de lire la musique.');
        }
    }
    if (command === 'pause') {
        const queue = player.getQueue(message.guild);
        if (!queue || !queue.playing) return message.channel.send('❌ Aucune musique en cours.');
        queue.setPaused(true);
        message.channel.send('⏸️ Musique mise en pause.');
    }
    if (command === 'resume') {
        const queue = player.getQueue(message.guild);
        if (!queue || !queue.paused) return message.channel.send('❌ Aucune musique en pause.');
        queue.setPaused(false);
        message.channel.send('▶️ Musique reprise.');
    }
    if (command === 'stop') {
        const queue = player.getQueue(message.guild);
        if (!queue) return message.channel.send('❌ Aucune musique en cours.');
        queue.destroy();
        message.channel.send('🛑 Musique arrêtée.');
    }
    if (command === 'skip') {
        const queue = player.getQueue(message.guild);
        if (!queue || !queue.playing) return message.channel.send('❌ Aucune musique en cours.');
        const currentTrack = queue.current;
        queue.skip();
        message.channel.send(`⏭️ Musique passée : **${currentTrack.title}**`);
    }

    // ----- AUTRES COMMANDES -----
    if (command === 'userinfo') {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);
        const userInfo = `
👤 **Infos sur l'utilisateur :**
- **Nom d'utilisateur :** ${user.username}
- **ID :** ${user.id}
- **Rejoint le serveur :** ${new Date(member.joinedAt).toLocaleDateString()}
- **Compte créé le :** ${new Date(user.createdAt).toLocaleDateString()}
        `;
        message.channel.send(userInfo);
    }
    if (command === 'hello') {
        message.channel.send(`Salut ${message.author.username} !`);
    }
    if (command === 'say') {
        const text = args.join(' ');
        if (!text) {
            message.channel.send('Veuillez fournir un texte à dire.');
            return;
        }
        message.channel.send(text);
    }
});

// 🔮 Fonction ChatGPT
async function getChatGPTResponse(userMessage) {
    try {
        const openai = require('openai');
        openai.apiKey = openaiApiKey;
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            store: true,
            messages: [{role:"user", content:userMessage}]
        });
        return completion.choices[0].message.content.trim();
    } catch(err) {
        console.error(err);
        return "Erreur ChatGPT";
    }
}

// 🔑 Connexion du bot
client.login(token).catch(err => console.error('Erreur login :', err));
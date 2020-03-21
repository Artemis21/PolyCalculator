require('dotenv').config();
const { Client, RichEmbed, Collection } = require('discord.js');
const bot = new Client();
const fs = require('fs')
const prefix = process.env.PREFIX
let calcServer = {}
let meee = {}
let logChannel = {}
let errorChannel = {}

// bot.commands as a collection(Map) of commands from ./commands
const commandFiles = fs.readdirSync('./bot/commands').filter(file => file.endsWith('.js'));
bot.commands = new Collection();
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  bot.commands.set(command.name, command);
}

// const dbStats = require('./util/dbStats');
const dbServers = require('./util/dbServers');
// const unitList = require('./util/unitsList')

// --------------------------------------
//
//       EVENT ON LOGIN
//
// --------------------------------------
bot.on('ready', () => {
  // eslint-disable-next-line no-console
  console.log(`Logged in as ${bot.user.username}`);

  calcServer = bot.guilds.get('581872879386492929')
  meee = calcServer.members.get('217385992837922819')
  logChannel = calcServer.channels.get('648688924155314176')
  errorChannel = calcServer.channels.get('658125562455261185')

  bot.user.setActivity(`${prefix}help c`, { type: 'LISTENING' })

  if(bot.user.id != process.env.BETABOT_ID)
    logChannel.send(`Logged in as ${bot.user.username}, ${meee}`)
});

// --------------------------------------
//
//      EVENT ON MESSAGE
//
// --------------------------------------
bot.on('message', async message => {
  if(message.author.bot || !message.content.startsWith(prefix) || message.content === prefix)
    return

  const logEmbed = new RichEmbed().setColor('#FA8072')
  // If it's a DM
  if(message.channel.type === 'dm') {
    logEmbed
      .setTitle(`DM from ${message.author}`)
      .addField('Content:', `${message.content}`)
    message.channel.send(`I do not (yet?) support DM commands.\nYou can go into any server I'm in and do \`${prefix}help c\` for help with my most common command.`)
    logChannel.send(logEmbed).then()
    return logChannel.send(`${meee}`).then()
  }

  // BOOLEAN for if the channel is registered as a bot channel in the bot
  let isBotChannel = false
  await dbServers.isRegisteredChannel(message.guild.id, message.channel.id)
    .then(x => isBotChannel = x)

  const textStr = message.content.slice(prefix.length)
  const commandName = textStr.split(/ +/).shift().toLowerCase();
  const argsStr = textStr.slice(commandName.length + 1)

  // Map all the commands
  const command = bot.commands.get(commandName) || bot.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

  // Return if the command doesn't exist
  if (!command)
    return

  // Instantiate the embed that's sent to every command execution
  const embed = new RichEmbed().setColor('#FA8072')

  // Warning when channel name includes general and delete both messages
  if(message.channel.name.includes('general'))
    return message.channel.send(`Come on! Not in #**${message.channel.name}**`)
      .then(x => x.delete(5000).then().catch(console.error)).catch(console.error).catch(console.error)

  // Check if command is allowed in that channel
  if(command.channelsAllowed) { // Certain commands can only be triggered in specific channels
    if(!(command.channelsAllowed && command.channelsAllowed.some(x => x === message.channel.id)))
      return
  }

  // Check if the user has the permissions necessary to execute the command
  if(!(command.permsAllowed.some(x => message.member.hasPermission(x)) || command.usersAllowed.some(x => x === message.author.id)))
    return message.channel.send('Only an admin can use this command, sorry!')

  try {
    // EXECUTE COMMAND
    const reply = command.execute(message, argsStr, embed);

    // Log the command
    if(message.cleanContent.length <= 256 && message.cleanContent.length >= 0) {
      logEmbed.setTitle(`**${message.cleanContent}**`)
        .setDescription(` in **${message.guild.name.toUpperCase()}**\nin ${message.channel} (#${message.channel.name})\nby ${message.author} (${message.author.tag})\n${message.url}`)
      logChannel.send(logEmbed)
    }

    return message.channel.send(reply)
      .then(x => {
        if(!isBotChannel) {
          x.delete(60000).then().catch(console.error)
          message.delete(60000).then().catch(console.error)
        }
      }).catch(console.error)
  } catch (error) {
    errorChannel.send(`**${message.cleanContent}** by ${message.author} (@${message.author.tag})\n${error}\n${message.url}`)
    return message.channel.send(`${error}`)
      .then(x => {
        if(!isBotChannel) {
          x.delete(15000).then().catch(console.error)
          message.delete(15000).then().catch(console.error)
        }
      }).catch(console.error)
  }
})

// --------------------------------------
//
//    EVENT ON CHANNEL DELETE
//
// --------------------------------------
bot.on('channelDelete', deletedChannel => {
  dbServers.getBotChannels(deletedChannel.guild.id)
    .then(x => { // x = array of bot channels
      if(x.some(y => y === deletedChannel.id))
        dbServers.removeABotChannel(deletedChannel.guild.id, deletedChannel.id)
          .then()
          .catch(console.error)
    })
    .catch(console.error)
})
// --------------------------------------
//
//    EVENT ON CHANNEL CREATE
//
// --------------------------------------
bot.on('channelCreate', createdChannel => {
  if(createdChannel.type != 'text')
    return

  if(createdChannel.name.includes('bot') || createdChannel.name.includes('command'))
    dbServers.addABotChannel(createdChannel.guild.id, createdChannel.id)
      .then()
      .catch(console.error)
})
// --------------------------------------
//
//    EVENT ON CHANNEL UPDATE
//
// --------------------------------------
bot.on('channelUpdate', (oldChannel, updatedChannel) => {
  if(updatedChannel.type != 'text')
    return

  dbServers.getBotChannels(updatedChannel.guild.id)
    .then(x => { // x = array of bot channels
      if(updatedChannel.name.includes('bot') || updatedChannel.name.includes('command')) {
        dbServers.addABotChannel(updatedChannel.guild.id, updatedChannel.id)
          .then()
          .catch(console.error)
      } else if (x.some(y => y === updatedChannel.id))
        dbServers.removeABotChannel(updatedChannel.guild.id, updatedChannel.id)
          .then()
          .catch(console.error)
      else
        return
    })
    .catch(console.error)
})
// --------------------------------------
//
//     EVENT ON NEW GUILD JOIN
//
// --------------------------------------
bot.on('guildCreate', guild => {
  const botChannels = guild.channels.filter(x => (x.name.includes('bot') || x.name.includes('command')) && x.type === 'text')

  dbServers.addNewServer(guild.id, guild.name, botChannels)
    .then(logMsg => {
      logChannel.send(logMsg.concat(', ', `${meee}!`))
        .then()
        .catch()
    })
    .catch(errorMsg => {
      errorChannel.send(errorMsg.concat(', ', `${meee}!`))
        .then()
        .catch()
    })
})
// --------------------------------------
//
//   EVENT ON REMOVE GUILD JOIN
//
// --------------------------------------
bot.on('guildDelete', guild => {
  dbServers.removeServer(guild.id, guild.name)
    .then(logMsg => {
      logChannel.send(logMsg.concat(', ', `${meee}!`))
        .then()
        .catch()
    })
    .catch(errorMsg => {
      errorChannel.send(errorMsg.concat(', ', `${meee}!`))
        .then()
        .catch()
    })
})

// --------------------------------------
//
//  EVENT ON NEW MEMBER IN DEV SERVER
//
// --------------------------------------
bot.on('guildMemberAdd', newMember => {
  if (newMember.guild.id === '581872879386492929') {
    newMember.addRole('654164652741099540')
      .then(x => {
        // eslint-disable-next-line no-console
        console.log(`${x.user.tag} just got in PolyCalculator server!`)
      })
      .catch(console.error)
  }
})

// --------------------------------------
//        END/OTHER
// --------------------------------------
setInterval(function() {
  // PICK A RANDOM BOT CHANNEL EVERY 3h?


  // const polytopia = bot.guilds.get('283436219780825088')

  // let botcommands = polytopia.channels.get('403724174532673536')
  // botcommands = { 'channel':botcommands }
  // Help('c', botcommands, true)
  // let rankedelogames = polytopia.channels.get('511316081160355852')
  // rankedelogames = { 'channel':rankedelogames }
  // Help('c', rankedelogames, true)
  // let unrankedgames = polytopia.channels.get('511906353476927498')
  // unrankedgames = { 'channel':unrankedgames }
  // Help('c', unrankedgames, true)
  // let elobotcommands = polytopia.channels.get('635091071717867521')
  // elobotcommands = { 'channel':elobotcommands }
  // Help('c', elobotcommands, true)
}, 10800000); // every 3h (10800000) 6h (21600000)

bot.login(process.env.TOKEN);
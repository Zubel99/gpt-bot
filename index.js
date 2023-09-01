require('dotenv/config');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const OpenAI = require('openai');

const gptModel = 'gpt-3.5-turbo'
const authorizedUsers = process.env.AUTHORIZED_USERS.split(' ')
const clearHistoryCommands = ['!reset', '!clear', '!clean']

const client = new Client({
    intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});
const openai = new OpenAI({
    apiKey: process.env.API_KEY,
})


client.on('ready', () => {
    console.log('Ready!');
    console.log(`Logged in as ${client.user.tag}!`);
});


const fetchAmount = 100;
const userMessageAmount = 4;

function sessionInfo(message, userMessageAmount, countMessages){
    if(countMessages >= userMessageAmount){
        message.author.send(':red_circle:  Session expired! Type !reset or !clean to start new one')
        return 1
    }
    // message.author.send(':warning:  Messages in session left: ' + (userMessageAmount - countMessages).toString());
    return 0
}

function getCurrentDate(){
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const date = new Date();
    const day = date.getDate();
    const monthIndex = date.getMonth();
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    const dateString = day + ' ' + months[monthIndex] + ' ' + year + ' ' + hours + ':' + minutes + ':' + seconds;
    // console.log(dateString);
    return dateString
}

client.on("messageCreate", async message => {
    if(message.author.bot) return // checks if message is from a bot
    if(message.guild) return; // checks if message is from a server, if field exists then yes, if not then no
    if(message.channel.type !== 1) return //checks if message is from dm, dm = 1, server channel = 0
    console.log(getCurrentDate(), '|', message.author.id, '-', message.author.username, '#', message.author.discriminator)
    // console.log('data: ', message)
    if(!authorizedUsers.find(item => authorizedUsers.includes(message.author.id))){
        message.reply('unauthorized')
        return
    }
    if(clearHistoryCommands.indexOf(message.content.toLowerCase()) !== -1){
        message.author.send(':recycle: Conversation history cleared' + '\nMessages in session left: ' + (userMessageAmount-1).toString())
        return
    }
    await message.channel.sendTyping()
    let interval = setInterval(async () => {
        await message.channel.sendTyping();
    }, 5000);

    let conversationLog = [{
        role: 'system',
        content: 'You are a friendly chatbot. I am going to give you multiple objects that represent history of out chat, keep them in mind for conversation context but dont respond to all of them, only to the newest one.'
    }]
    let lastUserMessages = []
    let prevMessages = await message.channel.messages.fetch({limit: fetchAmount})

    prevMessages.forEach(msg => {
        if (msg.author.id !== client.user.id && message.author.bot) return // checks if message is from a bot and if it is from the same bot
        if (msg.author.id !== message.author.id) return // checks if message is from the same user
        if(lastUserMessages.length >= userMessageAmount) return // max number of user messages in history
        lastUserMessages.push({
            role: 'user',
            content: msg.content
        })
    })
    // console.log(lastUserMessages)

    let countMessages = 0
    let stopFlag = false
    let filteredLastUserMessages = []
    lastUserMessages.forEach(msg => {
        if(clearHistoryCommands.indexOf(msg.content.toLowerCase()) !== -1) stopFlag = true
        if(stopFlag) return
        filteredLastUserMessages.push(msg)
    })
    // console.log(filteredLastUserMessages)
    filteredLastUserMessages = filteredLastUserMessages.reverse()

    filteredLastUserMessages.forEach(msg => {
        conversationLog.push(msg)
        countMessages++
    })

    if (sessionInfo(message, userMessageAmount, countMessages) == 1){ //check whether session expired (too many messages)
        clearInterval(interval);
        return
    }


    // console.log(filteredLastUserMessages)
    // console.log('count messages: ', countMessages)

    let result = ''
    try{
        result = await openai.chat.completions.create({ //    **** call do API ****
            model: gptModel,
            messages: conversationLog,
        })
    }
    catch(error){
        if(error.response.status && error.response.statusText){
            console.log(error.response.status)
            console.log(error.response.statusText)
            message.author.send(':skull:  Error: ' + error.response.status + ' - ' + error.response.statusText)
        }
        else{
            message.author.send('Unknown error, shouldnt happen')
        }
        clearInterval(interval);
        return
    }
    const gptMessage = result.choices[0].message.content

    // console.log('GPT-3 says: ', gptMessage)
    // console.log(gptMessage.length)
    if(gptMessage.length < 1999){
        message.reply(gptMessage);
    }
    else{
        const regex = /(.{1,1900}[.\s]|.{1901,1999}[.\s]|.{1,1900}$)/g;
        const splitGptMessage = gptMessage.match(regex);

        splitGptMessage.forEach((element, index) => {
            message.reply('(' + (index +1) + '/' + splitGptMessage.length + ') ' + element);
        });
    }
    message.author.send(':warning:  Messages in session left: ' + (userMessageAmount - countMessages - 1).toString());
    clearInterval(interval);
});


client.login(process.env.TOKEN);

require('dotenv/config');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { Configuration, OpenAIApi } = require('openai');

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
const configuration = new Configuration({
    apiKey: process.env.API_KEY,
})
const openai = new OpenAIApi(configuration)


client.on('ready', () => {
    console.log('Ready!');
    console.log(`Logged in as ${client.user.tag}!`);
});


const fetchAmount = 100;
const userMessageAmount = 15;

function sessionInfo(message, userMessageAmount, countMessages){
    if(countMessages >= userMessageAmount){
        message.author.send(':red_circle:  Session expired! Type !reset or !clean to start new one')
        return
    }
    message.author.send(':warning:  Messages in session left: ' + (userMessageAmount - countMessages).toString());
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
        message.reply(':recycle: Conversation history cleared' + '\nMessages in session left: ' + userMessageAmount.toString())
        return
    }
    await message.channel.sendTyping()
    // const interval = setInterval(async () => {
    //     await message.channel.sendTyping();
    // }, 5000);

    let conversationLog = [{
        role: 'system',
        content: 'You are a friendly chatbot. I am going to give you multiple objects that represent history of out chat, dont respond to all of them, only to the newest one.'
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


    // console.log(filteredLastUserMessages)
    // console.log('count messages: ', countMessages)

    let result = ''
    try{
        result = await openai.createChatCompletion({ //    **** call do API ****
            model: gptModel,
            messages: conversationLog,
        })
    }
    catch(error){
        if (error.statusCode === 503 && error.data &&
            error.data.error && error.data.error.message.includes("model is currently overloaded")) {
            console.error("GPT-3 model is overloaded, please try again later.")
            message.reply("GPT-3 model is overloaded, please try again later.")
            // throw error;
        } else {
            console.error('Weird error: ', error)
            message.reply(error.toString())
            message.reply('Unknown error, should still work')
            // throw error;
        }
        sessionInfo(message, userMessageAmount, countMessages)
        // clearInterval(interval);
        return
    }
    const gptMessage = result.data.choices[0].message.content

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

    sessionInfo(message, userMessageAmount, countMessages)
    // message.channel.stopTyping();

    // clearInterval(interval);
});


client.login(process.env.TOKEN);

const fs = require('fs');
const schemaPath = 'prisma/schema.prisma';
const modelsPath = 'bot-models.prisma';

const schemaContent = fs.readFileSync(schemaPath, 'utf8');
const modelsContent = fs.readFileSync(modelsPath, 'utf8');

if (!schemaContent.includes('model Conversation')) {
    fs.appendFileSync(schemaPath, '\n' + modelsContent);
    console.log('Modelos añadidos exitosamente.');
} else {
    console.log('Modelos ya existen.');
}

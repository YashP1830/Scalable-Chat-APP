# 1. Start with a lightweight, official Node.js image
FROM node:22-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy only the package.json files first (for caching efficiency)
COPY package*.json ./

# 4. Install dependencies inside the container
RUN npm install

# 5. Copy the rest of your backend code into the container
COPY . .

# 6. Expose the port your API server runs on
EXPOSE 5000

# 7. The default command to run when the container starts
CMD ["npm", "start"]
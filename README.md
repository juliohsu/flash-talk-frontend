# Frontend FlashTalk

App mobile do FlashTalk, um chat temporário para interações rápidas entre estudantes. Desenvolvido com React Native + Expo.

## Como rodar localmente?

### 1. Clonar e Instalar

```bash
git clone https://github.com/juliohsu/flash-talk-frontend.git
cd flash-talk-frontend
npm install
```

### 2. Pré-requisitos

- **Node.js** instalado
- **Expo CLI** (`npm install -g expo-cli`)
- **Expo Go** instalado no celular (iOS ou Android)
- **Backend rodando** na porta 3000 (veja o README do backend)

### 3. Executar o App

```bash
npm start
```

Você verá o QR code do Expo. Escaneie com o Expo Go no celular.

Ou inicie direto no emulador:

```bash
npm run ios       # iOS Simulator
npm run android   # Android Emulator
```

> **Nota:** O app detecta automaticamente o IP do servidor de desenvolvimento do Expo e conecta ao backend na porta 3000 do mesmo host.

## Funcionalidades

### Autenticação
- Registro de novo usuário (nome, email, senha)
- Login com email e senha
- Token JWT salvo localmente com AsyncStorage
- Redirecionamento automático (login → salas, ou salas → login)

### Salas
- Listar salas com abas: **Todas** / **Participando** / **Minhas**
- Criar sala (nome, descrição, pública ou privada)
- Entrar em sala pública diretamente
- Entrar em sala privada com chave de acesso (`accessKey`)
- Deletar sala (apenas o criador)
- Pull-to-refresh para atualizar a lista

### Chat em Tempo Real (Socket.IO)
- Enviar e receber mensagens instantaneamente
- Indicador de digitação ("Fulano está digitando...")
- Status de mensagem: enviada / entregue / lida
- Editar mensagem própria
- Deletar mensagem própria
- Scroll automático para novas mensagens
- Reconexão automática ao voltar do background

### Membros e Convites
- Visualizar membros da sala e seus papéis (owner, admin, member)
- Gerar link/chave de convite (apenas owner)
- Regenerar chave de acesso (revoga convites anteriores)
- Sair da sala

### Perfil e Admin
- Visualizar dados do perfil (nome, email, role)
- Painel admin: listar e deletar usuários (apenas role admin)

## Estrutura do Projeto

```
app/
├── _layout.tsx              # Layout raiz com Stack Navigator
├── index.tsx                # Guard de autenticação (redireciona login/salas)
├── login.tsx                # Tela de login
├── register.tsx             # Tela de registro
├── profile.tsx              # Tela de perfil + painel admin
└── rooms/
    ├── index.tsx            # Lista de salas com abas e criação
    └── [id].tsx             # Tela de chat com mensagens em tempo real
lib/
├── api.ts                   # Cliente REST com todos os endpoints tipados
├── auth.ts                  # Gerenciamento de token JWT (salvar, ler, decodificar)
└── socket.ts                # Conexão Socket.IO (singleton com reconexão automática)
```

## Telas do App

| Tela | Rota | Descrição |
|------|------|-----------|
| Splash | `/` | Verifica autenticação e redireciona |
| Login | `/login` | Formulário de email e senha |
| Registro | `/register` | Formulário de nome, email e senha |
| Salas | `/rooms` | Lista de salas com abas e criação |
| Chat | `/rooms/[id]` | Chat em tempo real com Socket.IO |
| Perfil | `/profile` | Dados do usuário e painel admin |

## Comunicação com o Backend

### API REST

O app se comunica com o backend via HTTP usando token JWT no header `Authorization: Bearer <token>`.

**Autenticação:**

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/auth/register` | Registrar usuário |
| POST | `/auth/login` | Login e obter token |
| GET | `/profile` | Dados do usuário logado |

**Salas:**

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/rooms` | Listar salas com filtros |
| POST | `/rooms` | Criar sala |
| GET | `/rooms/my` | Salas criadas pelo usuário |
| GET | `/rooms/joined/me` | Salas em que participa |
| GET | `/rooms/:id` | Buscar sala por ID |
| PUT | `/rooms/:id` | Atualizar sala (só criador) |
| DELETE | `/rooms/:id` | Deletar sala (só criador) |
| POST | `/rooms/:id/join` | Entrar na sala |
| DELETE | `/rooms/:id/leave` | Sair da sala |
| GET | `/rooms/:id/members` | Listar membros |
| GET | `/rooms/:id/invite` | Obter chave de convite (só owner) |
| POST | `/rooms/:id/invite/regenerate` | Regenerar chave (só owner) |

**Mensagens:**

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/messages` | Criar mensagem |
| GET | `/messages/room/:roomId` | Listar mensagens da sala |
| GET | `/messages/my` | Minhas mensagens |
| GET | `/messages/:id` | Buscar mensagem por ID |
| PUT | `/messages/:id` | Editar mensagem (só autor) |
| DELETE | `/messages/:id` | Deletar mensagem (só autor) |

**Usuários (admin):**

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/users` | Listar todos os usuários |
| DELETE | `/users/:id` | Deletar usuário |

### Socket.IO (Tempo Real)

**Eventos emitidos pelo app:**

| Evento | Descrição |
|--------|-----------|
| `join-room` | Entrar na sala para receber mensagens |
| `leave-room` | Sair da sala |
| `send-message` | Enviar mensagem |
| `typing` | Notificar que está digitando |
| `messages-delivered` | Confirmar entrega de mensagens |
| `messages-read` | Confirmar leitura de mensagens |

**Eventos recebidos pelo app:**

| Evento | Descrição |
|--------|-----------|
| `new-message` | Nova mensagem na sala |
| `user-typing` | Alguém está digitando |
| `user-joined` | Usuário entrou na sala |
| `user-left` | Usuário saiu da sala |
| `messages-status-updated` | Status de mensagens atualizado |

## Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm start` | Inicia o Expo dev server |
| `npm run ios` | Inicia no iOS Simulator |
| `npm run android` | Inicia no Android Emulator |

## Tecnologias

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| React Native | 0.81.5 | Framework mobile |
| Expo | ~54.0.0 | Plataforma de desenvolvimento |
| Expo Router | ~6.0.23 | Navegação por arquivo (file-based routing) |
| Socket.IO Client | ^4.8.3 | Comunicação em tempo real |
| AsyncStorage | 2.2.0 | Persistência local do token |
| TypeScript | ^5.7.0 | Tipagem estática |

## Troubleshooting

**App não conecta ao backend:**
- Verifique se o backend está rodando na porta 3000
- Celular e computador devem estar na mesma rede Wi-Fi
- O IP do servidor é detectado automaticamente pelo Expo

**Token inválido ou expirado:**
- O token expira em 1 hora
- Faça logout e login novamente

**Expo Go não carrega:**
- Verifique se o Expo CLI está instalado: `npx expo --version`
- Limpe o cache: `npx expo start --clear`

**Erro de dependências:**
```bash
rm -rf node_modules
npm install
```

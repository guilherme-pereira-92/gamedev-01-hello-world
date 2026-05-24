# 01 — Hello World

Primeiro projeto da minha jornada de game dev. Um quadrado azul que se move com WASD/setas em um canvas de 800×600.

**Stack:** TypeScript + [Phaser 3](https://phaser.io) + [Vite](https://vitejs.dev).

## Rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## O que aprendi aqui

### 1. Phaser.Game — o ponto de entrada

```ts
new Phaser.Game({
  type: Phaser.AUTO,    // tenta WebGL, cai pra Canvas se não rolar
  width: 800,
  height: 600,
  parent: "game",       // div onde o canvas é injetado
  scene: HelloScene,    // a cena inicial
});
```

Isso cria o **canvas**, o **game loop** e gerencia tudo. `Phaser.AUTO` escolhe o melhor renderer disponível.

### 2. Cena (Scene) — onde sua lógica vive

Toda a lógica do jogo fica dentro de uma classe que estende `Phaser.Scene`. Os métodos especiais que o Phaser chama:

- `preload()` — carregar assets (imagens, áudio). Não usei aqui porque o quadrado é uma forma geométrica.
- `create()` — roda uma vez, após `preload`. Aqui crio os objetos iniciais (texto, jogador, input).
- `update(time, delta)` — roda a cada frame (~60x por segundo). Aqui movo o jogador.

### 3. Game loop e `delta time`

O `update` recebe `delta` em **milissegundos** desde o último frame. Convertendo pra segundos (`dt = delta / 1000`) e multiplicando pela velocidade, o movimento fica **independente do framerate**:

```ts
this.player.x += dx * SPEED * dt;
```

Sem isso, o jogo correria mais rápido num monitor de 144Hz que num de 60Hz. **Sempre** multiplique velocidades por `dt`.

### 4. Input

Phaser dá duas formas:

```ts
this.cursors = keyboard.createCursorKeys();        // setas + space + shift
this.wasd = keyboard.addKeys("W,A,S,D");           // teclas arbitrárias
```

Em cada frame, leio `key.isDown` (booleano). Para detectar "tecla recém-pressionada" (útil para pulo etc.), usa-se `Phaser.Input.Keyboard.JustDown(key)`.

### 5. Normalização de diagonal

Se eu fizer `dx = 1, dy = 1`, o vetor tem módulo `√2 ≈ 1.41`, então o jogador andaria ~41% mais rápido na diagonal. Multiplicando por `1/√2` (`Math.SQRT1_2`) quando ambos eixos estão ativos, a velocidade fica igual em qualquer direção.

### 6. Clamp para não sair da tela

`Phaser.Math.Clamp(valor, min, max)` segura o valor no intervalo. Mais simples que `if (x < 0) x = 0; if (x > W) x = W;`.

## Conceitos novos introduzidos

| Conceito | O que é |
|----------|---------|
| **Game loop** | Ciclo `update → render` que roda a cada frame |
| **delta time** | Tempo entre frames, base do movimento independente de FPS |
| **Scene** | Container de lógica e objetos do jogo |
| **Input polling** | Ler estado de teclas a cada frame (vs eventos) |
| **Game object** | Qualquer coisa renderizável (texto, retângulo, sprite...) |

## Desafios para mim mesmo

Antes de ir pro projeto #02 (Pong), tentar:

1. Trocar o quadrado por um **círculo** (`this.add.circle(...)`).
2. Adicionar **aceleração** em vez de velocidade constante (segura uma direção, vai acelerando até um máximo).
3. Fazer o quadrado **deixar um rastro** de cópias semi-transparentes que somem com o tempo.
4. Adicionar uma tecla de **dash** (shift): teleporta 100px na direção atual.

## Próximo

[02 — Pong](../02-pong/) (a criar): física simples, colisão entre paddle e bola, sistema de pontuação.

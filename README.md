# 01 — Sequence

Jogo de memória estilo **Genius/Simon Says** usando as 4 setas (ou WASD).

> Esse projeto começou como um "hello world" (um quadrado que andava com WASD).
> A pasta ainda se chama `01-hello-world` porque é o **primeiro projeto da jornada**,
> mas evoluiu para a primeira aplicação completa: 4 painéis, áudio sintetizado,
> fases progressivas e melhor pontuação persistida.

**Como jogar:**
1. ESPAÇO inicia.
2. A sequência é tocada (painel acende + tom toca).
3. Sua vez: repita usando `↑ ↓ ← →` (ou `W A S D`).
4. Acertou → próxima fase (sequência maior e mais rápida).
5. Errou → fim. Sua melhor fase fica salva entre sessões.

**Controles:**
- `ESPAÇO`: iniciar
- `↑ ↓ ← →` ou `WASD`: responder
- `R`: nova partida (depois do game over)
- `K`: tira screenshot do canvas (PNG baixado automaticamente)

**Stack:** TypeScript + Phaser 3 + Vite + Web Audio API.

## Rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## Identidade visual

Esse projeto adota a paleta e tipografia do meu site público (`guilherme-pereira.dev`).
Os tokens estão em `src/theme.ts` e são **idênticos** nos projetos #02 e #03 — qualquer
mudança aqui precisa ser propagada.

| Token | Valor | Uso |
|-------|-------|-----|
| `bg` | `#0a0a0a` | Fundo near-black |
| `fg` | `#f5f1ea` | Texto principal |
| `accent` | `#ff4500` | Ember orange — painel ↑ |
| `secondary` | `#00d4ff` | Cyan — painel ← |
| `amber` | `#fbbf24` | Painel ↓ |
| `muted` | `#8a857c` | Texto secundário |
| `border` | `#1f1f1f` | Grid sutil ao fundo |
| Display | **Bricolage Grotesque** | Títulos, números |
| Mono | **Geist Mono** | UI, labels |

Fontes carregam do Google Fonts. O `main.ts` faz `await document.fonts.load(...)` antes
de instanciar o Phaser, evitando o flash de fallback no primeiro render.

## Estrutura

```
src/
├── main.ts                  # bootstrap + carrega fontes + instancia Phaser.Game
├── theme.ts                 # paleta, fontes, tamanhos (compartilhado entre projetos)
├── audio.ts                 # síntese Web Audio API (tons, sem arquivos .wav)
├── screenshot.ts            # game.renderer.snapshot → download PNG (bind em K)
└── scenes/
    └── SequenceScene.ts     # toda a lógica do jogo
```

## Conceitos novos (vs o "hello world" original)

### 1. Cena complexa com state machine de 5 estados

```ts
type GameState = "idle" | "show" | "input" | "wrong" | "gameover";
```

- `idle` — tela inicial, esperando ESPAÇO
- `show` — a sequência está sendo apresentada (inputs ignorados)
- `input` — vez do jogador, escuto teclas
- `wrong` — feedback de erro (shake + flash vermelho)
- `gameover` — esperando R pra reiniciar

Padrão de state machine já familiar do Pong/Snake, mas agora com **5 estados em vez de 3** e **transições temporais** (delayedCall pra avançar automaticamente).

### 2. Áudio sintetizado via Web Audio API

Sem assets de áudio (nada de `.wav`/`.mp3`). Cada nota é gerada por código:

```ts
const osc = audio.createOscillator();
const gain = audio.createGain();
osc.frequency.value = 392;          // G4 — painel ↑
gain.gain.setValueAtTime(0, now);
gain.gain.linearRampToValueAtTime(0.16, now + 0.012);          // attack 12ms
gain.gain.exponentialRampToValueAtTime(0.001, now + duration); // decay
osc.connect(gain).connect(audio.destination);
osc.start(now);
osc.stop(now + duration + 0.02);
```

**Por que envelope ADSR?** Sem ele, o tom começa e termina com um "click" audível (transição instantânea de 0 → volume → 0). Com attack/decay suave o som vira musical.

Frequências dos painéis: G4 (392 Hz), C5 (523), D5 (587), E5 (659) — formam um motivo melódico em sol maior.

### 3. AudioContext só após gesto do usuário

Browsers bloqueiam áudio até o usuário interagir (autoplay policy). O `AudioContext` começa em `suspended` e precisa de `audio.resume()` dentro de um evento de input:

```ts
kb.on("keydown", unlockAudio);  // primeiro keydown destrava
```

Se ignorar isso, os primeiros tons não tocam. Bug clássico de quem coloca áudio web.

### 4. Phase progression — sequência cresce e acelera

```ts
const phaseSequenceLength = (phase) => 3 + (phase - 1);
const phaseFlashMs       = (phase) => Math.max(140, 380 - (phase - 1) * 18);
const phaseGapMs         = (phase) => Math.max(60,  170 - (phase - 1) * 10);
```

- Fase 1: 3 passos, flash 380ms, gap 170ms
- Fase 5: 7 passos, flash 308ms, gap 130ms
- Fase 10: 12 passos, flash 218ms, gap 80ms
- Fase 14+: capped — flash 140ms, gap 60ms (limite de reação humana)

**A sequência cresce, não se reescreve.** A cada fase eu **adiciono 1 passo** ao array em vez de gerar do zero. Isso reproduz o feel original do Genius: você decora os primeiros e só precisa lembrar o novo.

### 5. Timing baseado em `delayedCall`

Phaser tem um sistema de timer integrado:

```ts
this.time.delayedCall(elapsed, () => this.flashPanel(panelId, flash));
```

Bem mais simples que `setTimeout` no contexto de uma cena — Phaser pausa esses timers se a cena pausar, e cancela se a cena for destruída. Não vaza.

Pra agendar a sequência inteira, eu calculo o `elapsed` cumulativo:

```ts
let elapsed = 650;
for (const panelId of this.sequence) {
  this.time.delayedCall(elapsed, () => this.flashPanel(panelId, flash));
  elapsed += flash + gap;
}
this.time.delayedCall(elapsed + 80, () => this.beginPlayerInput());
```

### 6. Feedback de erro: shake + flash + tom dissonante

```ts
playTone(180, 220, "sawtooth", 0.18);
this.cameras.main.shake(220, 0.008);
this.cameras.main.flash(160, 220, 40, 40, false);
```

- `sawtooth` em vez de `sine` → som mais áspero, "errado".
- Frequência baixa (180 Hz) → grave, ameaçador.
- `cameras.main.shake` → balança a câmera (intensidade 0.008 é sutil).
- `cameras.main.flash` → overlay de cor que desvanece (220, 40, 40 = vermelho).

**Princípio de game feel:** acerto e erro precisam ser **kinesteticamente diferentes**. Não basta um "GAME OVER" textual.

### 7. Tema compartilhado entre projetos

`src/theme.ts` é literalmente copiado entre os projetos `01-hello-world`, `02-pong` e `03-snake`. Não é DRY puro, mas:
- Cada projeto roda independente, sem package raiz.
- O arquivo é pequeno e estável.
- Evita complexidade de monorepo.

Quando evoluir a paleta, faço o update nos três. Documentado nos READMEs.

### 8. Screenshot via `game.renderer.snapshot()`

```ts
game.renderer.snapshot((image) => {
  if (image instanceof HTMLImageElement) {
    const link = document.createElement("a");
    link.download = `gamedev-01-sequence-${stamp}.png`;
    link.href = image.src;
    link.click();
  }
});
```

`snapshot()` captura o canvas atual e devolve um `HTMLImageElement` cuja `src` é uma data URL. Criar um `<a download="">` e dar `.click()` programaticamente força o navegador a baixar.

Comum em todos os projetos da jornada — bindado na tecla `K`. Vou usar pra capturar screenshots pro portfólio.

## Conceitos consolidados

| Conceito | Aplicação |
|----------|-----------|
| State machine 5 estados | idle → show → input → wrong → gameover |
| Web Audio synth | `OscillatorNode` + `GainNode` com envelope |
| AudioContext unlock | `keydown` → `audio.resume()` |
| `time.delayedCall` | Agendamento dentro de cena (auto-cleanup) |
| Sequência cumulativa | `array.push` por fase (não regenera) |
| Camera shake + flash | Feedback de erro kinestético |
| Tema compartilhado | Cópia de `theme.ts` entre projetos |
| Screenshot via canvas | `renderer.snapshot` + `<a download>` |

## Desafios para evoluir

1. **Modo prático**: opção no menu pra fixar uma fase (joga só fase 7, pra treinar).
2. **Som ambiente**: ruído sutil de fundo (LFO + filtro) quando idle, some quando começa partida.
3. **Animação de "respiração"** nos painéis durante idle (alpha pulsando).
4. **Histórico de tentativas**: mostrar últimas 5 sessões com fase atingida.
5. **Modo daily challenge**: sequência seedeada pela data (todo mundo tem a mesma sequência hoje).

## Próximo

[03 — Snake (upgrade)](../03-snake/) — adicionar campanha de 5 fases, dificuldades, tema visual compartilhado, screenshot key, e polish.

Depois: [02 — Pong (upgrade)](../02-pong/) — campanha vs CPU com 5 twists, modo treino, partículas, ball trail, som.

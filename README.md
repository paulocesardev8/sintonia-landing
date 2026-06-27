# Sintonia Solutions — Landing Page

Landing page institucional de Paulo Cesar / Sintonia Solutions: gestão de tráfego pago, mentoria individual (aula particular) e turmas em grupo.

🔗 **Produção:** [sintoniasolutions.com.br](https://sintoniasolutions.com.br)

---

## Stack

- HTML5 semântico
- CSS inline (tokens via `:root` custom properties, mobile-first)
- JavaScript vanilla (sem dependências)
- Fontes: Inter + Space Grotesk + JetBrains Mono (via Google Fonts)

Sem framework, sem build step. É um arquivo único (`index.html`) servido como estático.

## Estrutura

```
.
├── index.html               # Página completa (HTML + CSS + JS inline)
├── copy.txt                 # Copy de referência (não publicada)
├── design system.txt        # Tokens de design de referência (não publicado)
├── video hero lp.mp4        # Vídeo de fundo do hero (autoplay/muted/loop)
├── logo sintonia atual.png  # Logo da marca (header + footer)
├── fotos paulo/             # Retratos do Paulo (sobre / verdadeiro problema)
└── aulas fotos/             # Screenshots de aulas reais (galeria/marquee)
```

## Rodar localmente

Como é HTML estático, qualquer servidor local serve. Exemplo:

```bash
# Python
python -m http.server 5500

# Node (com http-server global)
npx http-server -p 5500

# VS Code: extensão Live Server
```

Abra `http://localhost:5500/`.

## Deploy (Vercel)

Projeto configurado como **Other** na Vercel — sem build command, output directory é a raiz do repo.

### vercel.json (opcional)

Não é necessário, mas recomendado para forçar cache longo dos assets:

```json
{
  "headers": [
    {
      "source": "/(.*\\.(mp4|png|jpg|jpeg|webp|svg))",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

## Seções da página

1. Hero (vídeo de fundo, headline em 2 linhas, CTA WhatsApp)
2. Micro garantias (atendimento direto, diagnóstico gratuito, transparência)
3. Problema / virada (split com retrato do Paulo)
4. O que é a Sintonia Solutions
5. Diferenciais (3 cards)
6. Pilares do método (4 blocos)
7. CTA intermediário
8. Para quem é (3 colunas — Gestão, Particular, Grupo)
9. Aulas reais (carrossel infinito de 8 fotos)
10. Garantia (90 dias / 7 dias)
11. Investimento (3 cards de preço)
12. Sobre Paulo Cesar
13. FAQ (acordeon)
14. CTA final + redes sociais
15. Rodapé

## Acessibilidade

- HTML semântico (`<header>`, `<main>`, `<nav>`, `<section>`, `<footer>`, `<details>`)
- Skip link no topo
- `aria-label` em controles e botões com ícone
- Contraste mínimo WCAG AA
- Navegação por teclado (focus visível)
- Respeita `prefers-reduced-motion` (desliga marquee, reveal, scroll smooth)
- Botões com área de toque mínima de 44px

## Performance

- Zero JS de terceiros
- Imagens com `loading="lazy"` (exceto hero)
- Vídeo do hero com `preload="auto"` e `muted` (autoplay nativo)
- CSS inline (1 round-trip)

---

© Sintonia Solutions · Paulo Cesar

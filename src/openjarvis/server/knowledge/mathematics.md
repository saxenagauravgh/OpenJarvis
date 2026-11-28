# Mathematics

## Real numbers
Level: 10
Keywords: real numbers, hcf, lcm, prime factorisation, irrational, fundamental theorem of arithmetic, terminating decimal, recurring decimal, number of divisors, prove root 2 irrational
**Key results:** Every integer $n>1$ is a product of primes, unique up to order. For two positive integers, $\mathrm{HCF}(a,b)\cdot\mathrm{LCM}(a,b)=ab$. If a prime $p$ divides $a^2$ ($a$ a positive integer), then $p$ divides $a$. $\sqrt{p}$ is irrational for prime $p$. Rational $\pm$ irrational, and nonzero rational $\times$ irrational, are irrational. A rational $p/q$ in lowest terms ($q>0$) terminates iff $q=2^m5^n$ with integers $m,n\ge0$. Otherwise its expansion is non-terminating recurring. If $n=\prod p_i^{a_i}$ (distinct primes $p_i$), it has $\prod(a_i+1)$ positive divisors.
**Methods:** HCF takes the lowest powers of common primes; LCM the highest powers of all primes. "Largest number dividing" suggests HCF; "first time together" suggests LCM. For irrationality, assume $\sqrt{p}=a/b$ with coprime integers, $b\ne0$, and show $p$ divides both.
**Common mistakes:** Using $\mathrm{HCF}\cdot\mathrm{LCM}=$ product for three numbers (false in general). Testing for termination before reducing the fraction. Assuming irrational $+$ irrational is always irrational. Calling $1$ prime.
**Teach it:** Ask: "Can $6^n$ end in the digit $0$ for a natural number $n$?" (No: $6^n$ has no factor $5$.) Teach the contradiction proof by naming the promise "no common factor" first, then showing how the algebra forces it to break.

## Polynomials
Level: 10, 11, JEE
Keywords: polynomial, zeroes, roots, sum and product of roots, cubic, remainder theorem, factor theorem, division algorithm, rational root, vieta, degree
**Key results:** A nonzero polynomial of degree $n$ has at most $n$ zeros. Division: $p(x)=g(x)q(x)+r(x)$ with $g\ne0$, and $r=0$ or $\deg r<\deg g$. Remainder on dividing by $x-a$ is $p(a)$; $x-a$ is a factor iff $p(a)=0$. For $ax^2+bx+c$, $a\ne0$: $\alpha+\beta=-b/a$, $\alpha\beta=c/a$. For $ax^3+bx^2+cx+d$, $a\ne0$: $\sum\alpha=-b/a$, $\sum\alpha\beta=c/a$, $\alpha\beta\gamma=-d/a$. Real coefficients: non-real zeros come in conjugate pairs. Rational coefficients: a zero $p+\sqrt{q}$ ($p,q$ rational, $\sqrt{q}$ irrational) pairs with $p-\sqrt{q}$. Integer coefficients: a root $u/v$ in lowest terms has $u$ dividing the constant and $v$ the leading coefficient.
**Methods:** Find one root by trial, divide, solve the quotient. For divisor of degree $2$, set remainder $Ax+B$ and substitute its roots (differentiate if repeated). Build symmetric expressions from sum and product.
**Common mistakes:** Sign errors in $-b/a$ and $-d/a$. Skipping zero coefficients in long division. Using conjugate pairing when coefficients are not real or rational as required.
**Teach it:** Ask: "What is the remainder when $x^3+1$ is divided by $x-2$?" (9). Explain the remainder theorem by writing $p(x)=(x-a)q(x)+r$ and putting $x=a$.

## Pair of linear equations
Level: 10
Keywords: linear equations in two variables, simultaneous equations, substitution method, elimination method, consistent, inconsistent, no solution, infinitely many solutions, graphical method, word problems
**Key results:** For $a_1x+b_1y+c_1=0$ and $a_2x+b_2y+c_2=0$, each with $(a_i,b_i)\ne(0,0)$: unique solution iff $a_1b_2-a_2b_1\ne0$ (intersecting lines). When $a_2,b_2,c_2$ are nonzero: $a_1/a_2=b_1/b_2=c_1/c_2$ gives coincident lines (infinitely many solutions); $a_1/a_2=b_1/b_2\ne c_1/c_2$ gives parallel lines (none). Unique solution: $x=\frac{b_1c_2-b_2c_1}{a_1b_2-a_2b_1}$, $y=\frac{c_1a_2-c_2a_1}{a_1b_2-a_2b_1}$.
**Methods:** Substitution if a coefficient is $\pm1$; elimination otherwise. If coefficients are swapped, add and subtract the equations. For $1/x,1/y$ forms put $u=1/x$, $v=1/y$ ($x,y\ne0$). In word problems define variables with units; boats: speeds $u\pm v$ with $u>v$; two-digit number: $10t+s$.
**Common mistakes:** Comparing ratios with constants on different sides. Subtracting an equation without changing every sign. Not converting back from $u,v$. Accepting negative ages or counts.
**Teach it:** Ask: "How many solutions have $x+2y=3$ and $2x+4y=8$?" (None.) Draw both lines: a solution is a common point, so the three cases are cross, parallel, overlap.

## Quadratic equations
Level: 10, 11, JEE
Keywords: quadratic, discriminant, nature of roots, completing the square, quadratic formula, location of roots, common root, maximum and minimum of quadratic, parabola sign
**Key results:** For $ax^2+bx+c=0$, $a\ne0$: $x=\frac{-b\pm\sqrt{D}}{2a}$, $D=b^2-4ac$. Real coefficients: $D>0$ distinct real, $D=0$ equal, $D<0$ non-real conjugates. Rational coefficients: roots rational iff $D$ is a rational square. Vertex $(-b/2a,\,-D/4a)$: minimum if $a>0$, maximum if $a<0$. $f(x)>0$ for all real $x$ iff $a>0,D<0$. Real $a,b,c$, real $k$: $k$ strictly between roots iff $af(k)<0$; both roots $>k$ iff $D\ge0$, $af(k)>0$, $-b/2a>k$ (for $<k$ reverse the last). One common root of $a_ix^2+b_ix+c_i=0$ with $a_1b_2\ne a_2b_1$: $(c_1a_2-c_2a_1)^2=(a_1b_2-a_2b_1)(b_1c_2-b_2c_1)$.
**Methods:** Location problems: sketch, then impose conditions on $D$, endpoint signs, vertex. Substitute $t=x^2$, $a^x$ or $x+1/x$ and keep the range of $t$. Exactly one root in $(p,q)$: $f(p)f(q)<0$ suffices; check endpoint and double-root cases.
**Common mistakes:** Forgetting the case leading coefficient $=0$. Cancelling a factor containing $x$. Keeping extraneous roots after squaring.
**Teach it:** Ask: "For which $k$ is $x^2+kx+1>0$ for all real $x$?" ($-2<k<2$.) Link each algebraic condition to a picture of the parabola.

## Sequences and series
Level: 10, 11, JEE
Keywords: arithmetic progression, geometric progression, ap, gp, nth term, sum of n terms, infinite series, am gm, sum of squares, telescoping, arithmetico geometric
**Key results:** AP: $a_n=a+(n-1)d$, $S_n=\frac n2[2a+(n-1)d]$. GP ($a,r\ne0$): $a_n=ar^{n-1}$, $S_n=\frac{a(r^n-1)}{r-1}$ for $r\ne1$, $S_n=na$ for $r=1$; $S_\infty=\frac{a}{1-r}$ only if $|r|<1$. Any sequence: $a_1=S_1$, $a_n=S_n-S_{n-1}$ for $n\ge2$. $\sum_{1}^{n}k=\frac{n(n+1)}2$, $\sum k^2=\frac{n(n+1)(2n+1)}6$, $\sum k^3=\left[\frac{n(n+1)}2\right]^2$. For $a,b>0$: $AM\ge GM\ge HM$, $GM^2=AM\cdot HM$; equality iff $a=b$. $\sum_{k\ge0}(a+kd)r^k=\frac{a}{1-r}+\frac{dr}{(1-r)^2}$, $|r|<1$.
**Methods:** Symmetric terms: $a-d,a,a+d$ or $a/r,a,ar$. AGP: subtract $rS$ from $S$. Telescope via $\frac1{k(k+1)}=\frac1k-\frac1{k+1}$. Otherwise find the general term, or use successive differences.
**Common mistakes:** Off-by-one in the number of terms. $n$ must be a positive integer. Applying $S_\infty$ when $|r|\ge1$. Using AM-GM with negative numbers.
**Teach it:** Ask: "If $S_n=n^2+1$, is it an AP?" (No: $a_1=2$, then $3,5,\dots$) Teach AP sum by writing the series forwards and backwards and adding.

## Trigonometric ratios and identities
Level: 10, 11, JEE
Keywords: trigonometry, sin cos tan, identities, compound angle, double angle, sum to product, radians, heights and distances, angle of elevation, maximum value
**Key results:** $\sin^2x+\cos^2x=1$; $1+\tan^2x=\sec^2x$ ($\cos x\ne0$); $1+\cot^2x=\csc^2x$ ($\sin x\ne0$). $\sin(A\pm B)=\sin A\cos B\pm\cos A\sin B$; $\cos(A\pm B)=\cos A\cos B\mp\sin A\sin B$; $\tan(A\pm B)=\frac{\tan A\pm\tan B}{1\mp\tan A\tan B}$ when all tangents exist. $\cos2A=2\cos^2A-1=1-2\sin^2A$; $\sin2A=2\sin A\cos A$. $\sin3A=3\sin A-4\sin^3A$; $\cos3A=4\cos^3A-3\cos A$. $\sin C+\sin D=2\sin\frac{C+D}2\cos\frac{C-D}2$; $\cos C-\cos D=-2\sin\frac{C+D}2\sin\frac{C-D}2$. $a\sin x+b\cos x$ ranges over $[-\sqrt{a^2+b^2},\sqrt{a^2+b^2}]$, $x\in\mathbb R$. Arc $l=r\theta$, $\theta$ in radians.
**Methods:** Convert to sine and cosine; fix sign by quadrant; use half-angle forms to lower powers. Heights: draw, mark angles from the horizontal, use $\tan$.
**Common mistakes:** $\sin(A+B)\ne\sin A+\sin B$. $\sqrt{\cos^2x}=|\cos x|$. Mixing degrees and radians. Using the amplitude range on a restricted interval.
**Teach it:** Ask: "$\cos x=-3/5$, $x$ in quadrant III: find $\sin x$." ($-4/5$.) Use the unit circle: cosine and sine are coordinates, so signs and symmetries become visible.

## Trigonometric equations and triangle properties
Level: 11, JEE
Keywords: trigonometric equation, general solution, principal solution, sine rule, cosine rule, area of triangle, circumradius, inradius, heron, half angle formula
**Key results:** $n\in\mathbb Z$. $\sin x=\sin\alpha\Rightarrow x=n\pi+(-1)^n\alpha$. $\cos x=\cos\alpha\Rightarrow x=2n\pi\pm\alpha$. $\tan x=\tan\alpha$ ($\tan\alpha$ defined) $\Rightarrow x=n\pi+\alpha$. $\sin^2x=\sin^2\alpha\Rightarrow x=n\pi\pm\alpha$. Triangle with side $a$ opposite $A$, $s=\frac{a+b+c}2$: $\frac a{\sin A}=\frac b{\sin B}=\frac c{\sin C}=2R$; $\cos A=\frac{b^2+c^2-a^2}{2bc}$; $a=b\cos C+c\cos B$; $\Delta=\frac12bc\sin A=\sqrt{s(s-a)(s-b)(s-c)}=\frac{abc}{4R}=rs$; $\tan\frac A2=\sqrt{\frac{(s-b)(s-c)}{s(s-a)}}$; $r=4R\sin\frac A2\sin\frac B2\sin\frac C2$.
**Methods:** Factorise, or reduce to one ratio, or write $a\cos x+b\sin x=c$ as $R\cos(x-\phi)=c$ (solvable iff $c^2\le a^2+b^2$). Principal solutions: those in $[0,2\pi)$. In triangles replace sides by $2R\sin$ of the opposite angle or use cosine rule.
**Common mistakes:** Dividing by a factor that can be zero (lost roots). Squaring without checking. Keeping values where $\tan,\sec$ are undefined. In SSA data, missing the second possible angle.
**Teach it:** Ask: "Solve $\sin x\cos x=\sin x$." ($x=n\pi$, or $\cos x=1$, already included.) Show all solutions on a unit circle, then add whole periods.

## Inverse trigonometric functions
Level: 12, JEE
Keywords: inverse trigonometry, arcsin, arctan, principal value, principal range, domain of inverse trig, tan inverse sum, sin inverse of sin
**Key results:** Domain to principal range: $\sin^{-1}:[-1,1]\to[-\frac\pi2,\frac\pi2]$; $\cos^{-1}:[-1,1]\to[0,\pi]$; $\tan^{-1}:\mathbb R\to(-\frac\pi2,\frac\pi2)$; $\cot^{-1}:\mathbb R\to(0,\pi)$; $\sec^{-1}:|x|\ge1\to[0,\pi]-\{\frac\pi2\}$; $\csc^{-1}:|x|\ge1\to[-\frac\pi2,\frac\pi2]-\{0\}$. $\sin^{-1}x+\cos^{-1}x=\frac\pi2$ ($|x|\le1$); $\tan^{-1}x+\cot^{-1}x=\frac\pi2$ (all $x$). $\cos^{-1}(-x)=\pi-\cos^{-1}x$ ($|x|\le1$). $\tan^{-1}x+\tan^{-1}y=\tan^{-1}\frac{x+y}{1-xy}+k\pi$: $k=0$ if $xy<1$; $k=1$ if $xy>1,x>0$; $k=-1$ if $xy>1,x<0$ (if $xy=1$ the sum is $\pm\frac\pi2$, sign of $x$). $2\tan^{-1}x=\sin^{-1}\frac{2x}{1+x^2}$ ($|x|\le1$) $=\cos^{-1}\frac{1-x^2}{1+x^2}$ ($x\ge0$).
**Methods:** Set $\theta$ equal to the inverse value, note its range, draw a triangle. Substitute $x=\sin\theta,\tan\theta$ and track the interval of $\theta$.
**Common mistakes:** Reading $\sin^{-1}x$ as $1/\sin x$. Writing $\sin^{-1}(\sin\theta)=\theta$ outside $[-\frac\pi2,\frac\pi2]$. Not verifying roots of inverse-trig equations.
**Teach it:** Ask: "Find $\sin^{-1}(\sin\frac{2\pi}3)$." ($\pi/3$.) Plot $y=\sin^{-1}(\sin x)$ as a zigzag after showing why sine must be restricted to be invertible.

## Triangles and circle geometry
Level: 10, JEE
Keywords: similar triangles, similarity criteria, basic proportionality theorem, thales, pythagoras, tangent to circle, cyclic quadrilateral, angle in semicircle, angle bisector theorem
**Key results:** A line parallel to one side of a triangle, cutting the other two at distinct points, divides them in the same ratio (converse true). Similarity: AA, SSS in proportion, or SAS with the included angle. Similar triangles: area ratio $=$ (side ratio)$^2$. A triangle is right-angled at $C$ iff $c^2=a^2+b^2$. Internal bisector of $A$ meets $BC$ at $D$: $BD/DC=AB/AC$. Tangent $\perp$ radius at contact; the two tangents from an external point are equal. Angle at centre is twice the angle at the circumference on the same arc; angle in a semicircle is $90^\circ$; opposite angles of a cyclic quadrilateral sum to $180^\circ$. Tangent-chord angle equals the angle in the alternate segment. From external $P$ with secants $PAB,PCD$ and tangent $PT$: $PA\cdot PB=PC\cdot PD=PT^2$. Quadrilateral circumscribing a circle: $AB+CD=BC+DA$.
**Methods:** Mark equal angles, name similar triangles with vertices in matching order, then write ratios. Join centre to contact points.
**Common mistakes:** Using SSA as a general criterion (only the right angle, hypotenuse, side case works). Mismatched correspondence. With $DE\parallel BC$, writing $DE/BC=AD/DB$ instead of $AD/AB$. Assuming from the figure.
**Teach it:** Ask: "Similar triangles have sides $2:3$; area ratio?" ($4:9$.) Explain similarity as photocopy scaling: angles stay, lengths scale by $k$, areas by $k^2$.

## Mensuration
Level: 10, JEE
Keywords: surface area, volume, cylinder, cone, sphere, hemisphere, cuboid, sector, segment, arc length, frustum, melting and recasting, combined solids
**Key results:** Cuboid: $V=lbh$, TSA $2(lb+bh+hl)$, diagonal $\sqrt{l^2+b^2+h^2}$. Right circular cylinder: $V=\pi r^2h$, CSA $2\pi rh$, TSA $2\pi r(r+h)$. Right circular cone: $V=\frac13\pi r^2h$, $l=\sqrt{r^2+h^2}$, CSA $\pi rl$, TSA $\pi r(r+l)$. Sphere: $V=\frac43\pi r^3$, area $4\pi r^2$. Solid hemisphere: $V=\frac23\pi r^3$, CSA $2\pi r^2$, TSA $3\pi r^2$. Angle $\theta$ in degrees, $0<\theta<360$: arc $\frac\theta{360}2\pi r$, sector $\frac\theta{360}\pi r^2$, segment $=$ sector $-\frac12r^2\sin\theta$. Frustum: $V=\frac{\pi h}3(R^2+Rr+r^2)$, CSA $\pi(R+r)l$, $l=\sqrt{h^2+(R-r)^2}$.
**Methods:** Combined solids: add only exposed surfaces; volumes add or subtract. Recasting: volume conserved. Water flow: volume rate $=$ cross-section $\times$ speed. Keep one unit system ($1\,\mathrm L=1000\,\mathrm{cm^3}$).
**Common mistakes:** Slant height used as height. Diameter used as radius. Counting joined faces. Sector perimeter without the two radii. Ignoring the stated value of $\pi$.
**Teach it:** Ask: "A cone sits on a hemisphere of equal radius; which areas make the surface?" (Both curved areas only.) Have the learner imagine painting the object.

## Sets, relations and functions
Level: 11, 12, JEE
Keywords: sets, venn diagram, subsets, de morgan, relation, equivalence relation, one one, onto, bijective, domain and range, composite function, inverse function, periodic
**Key results:** Finite sets: $n(A\cup B)=n(A)+n(B)-n(A\cap B)$. $(A\cup B)'=A'\cap B'$. An $n$-element set has $2^n$ subsets. Relations $A\to B$ ($|A|=m,|B|=n$): $2^{mn}$. On $n$ elements: reflexive $2^{n^2-n}$, symmetric $2^{n(n+1)/2}$. Equivalence $=$ reflexive, symmetric, transitive; its classes partition the set. For $m,n\ge1$: functions $n^m$; injections $\frac{n!}{(n-m)!}$ if $m\le n$, else $0$; surjections $\sum_{k=0}^{n}(-1)^k\binom nk(n-k)^m$. $f$ invertible iff bijective; for bijections $(g\circ f)^{-1}=f^{-1}\circ g^{-1}$. $g\circ f$ injective $\Rightarrow f$ injective; surjective $\Rightarrow g$ surjective. $\sin(ax+b)$ has period $2\pi/|a|$ ($a\ne0$).
**Methods:** Injective: solve $f(x_1)=f(x_2)$ or show strict monotonicity. Surjective: solve $y=f(x)$ inside the domain and compare range with codomain. Domain: denominators nonzero, even roots of nonnegatives, log arguments positive.
**Common mistakes:** Ignoring domain and codomain. Confusing $\in$ with $\subset$. Thinking symmetric plus transitive gives reflexive. $g\circ f\ne f\circ g$ generally.
**Teach it:** Ask: "Is $f(x)=x^2$ from $\mathbb R$ to $\mathbb R$ invertible?" (No; it is on $[0,\infty)\to[0,\infty)$.) Use arrow diagrams and the horizontal line test.

## Complex numbers
Level: 11, JEE
Keywords: complex numbers, iota, modulus, argument, conjugate, polar form, euler form, de moivre, roots of unity, cube roots of unity, argand plane, locus
**Key results:** $z=x+iy$ ($x,y$ real), $|z|=\sqrt{x^2+y^2}$, $z\bar z=|z|^2$, $|z_1z_2|=|z_1||z_2|$. $||z_1|-|z_2||\le|z_1+z_2|\le|z_1|+|z_2|$. Principal $\arg z\in(-\pi,\pi]$, $z\ne0$; $\arg(z_1z_2)=\arg z_1+\arg z_2$ modulo $2\pi$. $(\cos\theta+i\sin\theta)^n=\cos n\theta+i\sin n\theta$, $n\in\mathbb Z$. Roots of $w^n=re^{i\theta}$ ($r>0$, $n\in\mathbb N$): $r^{1/n}e^{i(\theta+2\pi k)/n}$, $k=0,\dots,n-1$. Cube root of unity $\omega\ne1$: $1+\omega+\omega^2=0$, $\omega^3=1$. Loci: $|z-a|=r>0$ circle; $|z-a|=|z-b|$, $a\ne b$, perpendicular bisector; $|z-a|+|z-b|=k>|a-b|$ ellipse ($k=|a-b|$: segment).
**Methods:** Divide by multiplying with the conjugate. Powers: polar form. Real iff $z=\bar z$; purely imaginary (or zero) iff $z=-\bar z$. Rotating $z_2$ about $z_1$ anticlockwise by $\alpha$ to $z_3$: $z_3-z_1=(z_2-z_1)e^{i\alpha}$.
**Common mistakes:** $\sqrt a\sqrt b=\sqrt{ab}$ when $a,b<0$. Taking $\arg=\tan^{-1}(y/x)$ ignoring quadrant. Ordering non-real numbers.
**Teach it:** Ask: "Principal argument of $-1-i$?" ($-3\pi/4$.) Teach multiplication as stretch by modulus and turn by argument.

## Inequalities
Level: 11, JEE
Keywords: inequality, linear inequalities, solution set, number line, wavy curve method, modulus inequality, logarithmic inequality, rational inequality, am gm inequality, cauchy schwarz
**Key results:** Adding a number preserves order; multiplying or dividing by a negative reverses it. $|x|<a\iff-a<x<a$ ($a>0$); $|x|>a\iff x<-a$ or $x>a$ ($a\ge0$). If $a<b$ with $ab>0$, then $1/a>1/b$. For $x,y>0$: $\log_ax>\log_ay\iff x>y$ if $a>1$, $x<y$ if $0<a<1$. AM-GM: $x_i\ge0$, $\frac{\sum x_i}n\ge(\prod x_i)^{1/n}$, equality iff all equal. $(\sum a_ib_i)^2\le\sum a_i^2\sum b_i^2$ (reals). $\sqrt f<g\iff f\ge0,\ g>0,\ f<g^2$. $\sqrt f>g\iff(g<0,\ f\ge0)$ or $(g\ge0,\ f>g^2)$.
**Methods:** Bring all terms to one side, factorise, mark critical points; sign flips at odd-multiplicity roots, not even. Exclude denominator zeros; include numerator zeros for $\le,\ge$ if allowed. For moduli split at breakpoints. Two variables: draw the boundary (dashed if strict) and test a point.
**Common mistakes:** Cross-multiplying by an expression of unknown sign. Squaring without checking signs. Forgetting log domain. Confusing "and" with "or".
**Teach it:** Ask: "Solve $\frac1x<1$." ($x<0$ or $x>1$.) Test $x=-1$ to show why cross-multiplying fails, then build a sign chart.

## Permutations and combinations
Level: 11, JEE
Keywords: permutation, combination, factorial, counting principle, arrangements, selections, circular permutation, stars and bars, derangement, distribution into groups
**Key results:** For integers $0\le r\le n$: ${}^nP_r=\frac{n!}{(n-r)!}$, ${}^nC_r=\frac{n!}{r!(n-r)!}={}^nC_{n-r}$; ${}^nC_r+{}^nC_{r-1}={}^{n+1}C_r$ ($1\le r\le n$). Repeated items: $\frac{n!}{p!\,q!\cdots}$. Circular, distinct items: $(n-1)!$; if reflections coincide, $\frac{(n-1)!}2$ ($n\ge3$). Solutions of $x_1+\dots+x_r=n$ ($r\ge1$): nonnegative integers $\binom{n+r-1}{r-1}$; positive $\binom{n-1}{r-1}$ ($n\ge r$). Derangements $D_n=n!\sum_{k=0}^n\frac{(-1)^k}{k!}$. Splitting $mn$ distinct items into $m$ unlabelled groups of $n$: $\frac{(mn)!}{(n!)^m\,m!}$.
**Methods:** Decide: does order matter, is repetition allowed, are objects and boxes distinct? Together: glue into a block (times internal orders). Apart: place others, fill gaps. "At least": complement. Digits: handle restricted places first; split cases on zero and parity.
**Common mistakes:** Multiplying exclusive cases or adding successive stages (do the reverse). Double counting by "choose one first, then any". Leading zero. Dividing by $m!$ when groups are labelled.
**Teach it:** Ask: "Choose a captain and vice-captain from $5$: $10$ or $20$?" ($20$.) List a tiny case so the learner sees which outcomes are the same.

## Binomial theorem
Level: 11, JEE
Keywords: binomial theorem, binomial expansion, general term, middle term, binomial coefficients, independent term, greatest term, remainder using binomial, multinomial
**Key results:** For integer $n\ge0$: $(a+b)^n=\sum_{r=0}^n\binom nra^{n-r}b^r$; $T_{r+1}=\binom nra^{n-r}b^r$. Middle term: $T_{n/2+1}$ ($n$ even); $T_{(n+1)/2},T_{(n+3)/2}$ ($n$ odd). With $C_r=\binom nr$: $\sum C_r=2^n$; $\sum(-1)^rC_r=0$ ($n\ge1$); $\sum rC_r=n\,2^{n-1}$ ($n\ge1$); $\sum C_r^2=\binom{2n}n$. $(x_1+\dots+x_k)^n$ has $\binom{n+k-1}{k-1}$ distinct terms before any further collecting; coefficient $\frac{n!}{n_1!\cdots n_k!}$ with $\sum n_i=n$. Real index: $(1+x)^\alpha=1+\alpha x+\frac{\alpha(\alpha-1)}{2!}x^2+\cdots$ for $|x|<1$.
**Methods:** Required power: write the exponent in $T_{r+1}$, solve for integer $0\le r\le n$. Numerically greatest term: compare $\left|\frac{T_{r+1}}{T_r}\right|=\frac{n-r+1}r\left|\frac ba\right|$ with $1$. Coefficient sums: substitute $x=1,-1,\omega$, differentiate or integrate. Remainders: write the base as multiple of divisor $\pm1$.
**Common mistakes:** Taking $T_r$ instead of $T_{r+1}$. Confusing coefficient with binomial coefficient. Dropping signs. Negative remainder not adjusted.
**Teach it:** Ask: "Which term of $(x+1/x)^6$ is free of $x$?" (Fourth, value $20$.) Explain $\binom nr$ as choosing which $r$ brackets supply $b$.

## Straight lines
Level: 10, 11, JEE
Keywords: coordinate geometry, distance formula, section formula, slope, equation of line, intercept form, perpendicular distance, angle between lines, foot of perpendicular, image, concurrency, centroid
**Key results:** Distance $\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}$. Division $m:n$: internal $\left(\frac{mx_2+nx_1}{m+n},\frac{my_2+ny_1}{m+n}\right)$; external replace $n$ by $-n$ ($m\ne n$). Centroid $\left(\frac{x_1+x_2+x_3}3,\frac{y_1+y_2+y_3}3\right)$. Area $\frac12|x_1(y_2-y_3)+x_2(y_3-y_1)+x_3(y_1-y_2)|$. $y-y_1=m(x-x_1)$; $\frac xa+\frac yb=1$ ($a,b\ne0$). Finite slopes: parallel $m_1=m_2$, perpendicular $m_1m_2=-1$, acute angle $\tan\theta=\left|\frac{m_1-m_2}{1+m_1m_2}\right|$ ($m_1m_2\ne-1$). Distance to $Ax+By+C=0$: $\frac{|Ax_1+By_1+C|}{\sqrt{A^2+B^2}}$; between parallels $\frac{|C_1-C_2|}{\sqrt{A^2+B^2}}$ (same $A,B$). Foot $(h,k)$: $\frac{h-x_1}A=\frac{k-y_1}B=-\frac{Ax_1+By_1+C}{A^2+B^2}$; image: double the right side (if $A$ or $B$ is $0$, that numerator is $0$). $ax^2+2hxy+by^2=0$ ($h^2\ge ab$): $\tan\theta=\frac{2\sqrt{h^2-ab}}{|a+b|}$; perpendicular iff $a+b=0$.
**Methods:** Through an intersection: $L_1+\lambda L_2=0$ (check $L_2$ itself). Locus: take $(h,k)$, impose condition, eliminate parameters.
**Common mistakes:** Missing vertical lines in slope form. Intercepts treated as lengths. Zero determinant alone does not prove concurrency (lines may be parallel).
**Teach it:** Ask: "Slope of a line perpendicular to $y=3$?" (Undefined.) Show slope as rise per unit run.

## Circles
Level: 11, JEE
Keywords: circle equation, centre and radius, tangent to circle, chord of contact, length of tangent, radical axis, orthogonal circles, common tangents, family of circles, diameter form
**Key results:** $S\equiv x^2+y^2+2gx+2fy+c=0$: centre $(-g,-f)$, $r=\sqrt{g^2+f^2-c}$, real circle if $g^2+f^2>c$. Diameter ends: $(x-x_1)(x-x_2)+(y-y_1)(y-y_2)=0$. $S_1=S(x_1,y_1)>0,=0,<0$: outside, on, inside. $T\equiv xx_1+yy_1+g(x+x_1)+f(y+y_1)+c$. $T=0$: tangent (point on circle) or chord of contact (outside). Chord with midpoint $(x_1,y_1)$ (inside, not the centre): $T=S_1$. Tangent length $\sqrt{S_1}$. Tangents to $x^2+y^2=a^2$: $y=mx\pm a\sqrt{1+m^2}$. Chord at distance $p\le r$: length $2\sqrt{r^2-p^2}$. Common tangents, centre distance $d$, radii $r_1,r_2$: $4$ if $d>r_1+r_2$; $3$ if $d=r_1+r_2$; $2$ if $|r_1-r_2|<d<r_1+r_2$; $1$ if $d=|r_1-r_2|>0$; $0$ if less. Orthogonal: $2g_1g_2+2f_1f_2=c_1+c_2$. Radical axis $S_1-S_2=0$ (non-concentric circles, both with $x^2,y^2$ coefficients $1$).
**Methods:** Tangency: distance from centre $=r$. Families: $S+\lambda L=0$ or $S+\lambda S'=0$ ($\lambda\ne-1$).
**Common mistakes:** Not making $x^2,y^2$ coefficients $1$. Sign of centre. Losing a vertical tangent in slope form.
**Teach it:** Ask: "Centre of $x^2+y^2-4x+6y=3$?" ($(2,-3)$, radius $4$.) Complete the square, then use the right angle between radius and tangent.

## Conic sections
Level: 11, JEE
Keywords: parabola, ellipse, hyperbola, focus, directrix, eccentricity, latus rectum, tangent to conic, parametric coordinates, asymptotes, rectangular hyperbola
**Key results:** $y^2=4ax$ ($a>0$): focus $(a,0)$, directrix $x=-a$, latus rectum $4a$, point $(at^2,2at)$, tangent $ty=x+at^2$, also $y=mx+\frac am$ ($m\ne0$), normal $y=-tx+2at+at^3$; focal chord $t_1t_2=-1$. Ellipse $\frac{x^2}{a^2}+\frac{y^2}{b^2}=1$ ($a>b>0$): $e=\sqrt{1-b^2/a^2}$, foci $(\pm ae,0)$, directrices $x=\pm a/e$, latus rectum $2b^2/a$, $PS+PS'=2a$, tangents $y=mx\pm\sqrt{a^2m^2+b^2}$, point $(a\cos\theta,b\sin\theta)$, area $\pi ab$. Hyperbola $\frac{x^2}{a^2}-\frac{y^2}{b^2}=1$ ($a,b>0$): $e=\sqrt{1+b^2/a^2}$, $|PS-PS'|=2a$, asymptotes $y=\pm\frac ba x$, tangents $y=mx\pm\sqrt{a^2m^2-b^2}$ ($|m|>b/a$), point $(a\sec\theta,b\tan\theta)$. $xy=c^2$: $e=\sqrt2$.
**Methods:** Complete squares and shift origin. Identify the major or transverse axis first. Tangent at $(x_1,y_1)$ on curve: replace $x^2\to xx_1$, $2x\to x+x_1$ (same for $y$), $2xy\to xy_1+x_1y$.
**Common mistakes:** Applying $a>b$ formulas to a vertical ellipse. Angle $\theta$ is eccentric angle, not polar angle. $a>b$ is not required for a hyperbola.
**Teach it:** Ask: "Foci of $x^2/9+y^2/25=1$?" ($(0,\pm4)$.) Unify by focus-directrix: $PS=e\cdot PM$.

## Limits and continuity
Level: 11, 12, JEE
Keywords: limit, continuity, indeterminate form, left hand limit, right hand limit, l'hopital rule, standard limits, squeeze theorem, intermediate value theorem, discontinuity
**Key results:** A finite limit exists iff both one-sided limits exist and are equal. As $x\to0$ (radians): $\frac{\sin x}x,\frac{\tan x}x,\frac{e^x-1}x,\frac{\ln(1+x)}x\to1$; $\frac{1-\cos x}{x^2}\to\frac12$; $\frac{a^x-1}x\to\ln a$ ($a>0$); $(1+x)^{1/x}\to e$. $\lim_{x\to a}\frac{x^n-a^n}{x-a}=na^{n-1}$ ($a>0$, real $n$). If $f\to1$, $g\to\pm\infty$ and $L=\lim g(f-1)$ exists, then $\lim f^g=e^L$. L'Hopital: for $0/0$ or $\infty/\infty$, with $f,g$ differentiable near $a$, $g'\ne0$ there, and $\lim f'/g'$ existing or infinite, $\lim f/g$ equals it. Continuity at $a$: $\lim_{x\to a}f=f(a)$. Continuous $f$ on $[a,b]$ takes every value between $f(a),f(b)$ and attains max and min.
**Methods:** Substitute first; factorise, rationalise, divide by highest power, or expand in series. Unknown constants: match LHL, RHL, value. Check breakpoints of $|x|$ and $[x]$ from both sides.
**Common mistakes:** L'Hopital on non-indeterminate forms. $\sqrt{x^2}=-x$ as $x\to-\infty$. Treating $1^\infty$ as $1$. Replacing one term of a difference by its approximation.
**Teach it:** Ask: "Does $|x|/x$ have a limit at $0$?" (No: $\pm1$.) Use tables from both sides to separate limit from function value.

## Differentiation
Level: 11, 12, JEE
Keywords: derivative, differentiation, chain rule, product rule, quotient rule, implicit differentiation, logarithmic differentiation, parametric, second derivative, differentiability, first principles
**Key results:** $f'(a)=\lim_{h\to0}\frac{f(a+h)-f(a)}h$. Differentiable $\Rightarrow$ continuous; converse false. $(x^n)'=nx^{n-1}$ (where defined); $(e^x)'=e^x$; $(a^x)'=a^x\ln a$ ($a>0$); $(\ln|x|)'=1/x$ ($x\ne0$); $\sin'=\cos$, $\cos'=-\sin$, $\tan'=\sec^2$, $\cot'=-\csc^2$, $\sec'=\sec\tan$, $\csc'=-\csc\cot$. $(\sin^{-1}x)'=\frac1{\sqrt{1-x^2}}=-(\cos^{-1}x)'$ ($|x|<1$); $(\tan^{-1}x)'=\frac1{1+x^2}$; $(\sec^{-1}x)'=\frac1{|x|\sqrt{x^2-1}}$ ($|x|>1$). $(uv)'=u'v+uv'$; $(u/v)'=\frac{u'v-uv'}{v^2}$; $(f(g))'=f'(g)g'$. $(f^{-1})'(f(a))=1/f'(a)$ if $f$ is invertible near $a$ and $f'(a)\ne0$. $(u^v)'=u^v\left(v'\ln u+\frac{vu'}u\right)$, $u>0$.
**Methods:** Parametric: $\frac{dy}{dx}=\frac{\dot y}{\dot x}$ ($\dot x\ne0$); $\frac{d^2y}{dx^2}=\frac{d}{dt}\left(\frac{dy}{dx}\right)\Big/\dot x$. Implicit: differentiate both sides, attach $y'$. Piecewise: check continuity, then one-sided derivatives.
**Common mistakes:** Forgetting the inner derivative. Using the power rule on $x^x$. Writing $d^2y/dx^2=\ddot y/\ddot x$.
**Teach it:** Ask: "Derivative of $\sin(x^2)$?" ($2x\cos x^2$.) Present the chain rule as multiplying rates through linked gears.

## Applications of derivatives
Level: 12, JEE
Keywords: maxima, minima, increasing decreasing, monotonicity, rate of change, tangent and normal, rolle theorem, mean value theorem, optimisation, critical point, approximation
**Key results:** On an interval, $f'>0$ implies strictly increasing, $f'<0$ strictly decreasing; this still holds with $\ge,\le$ if $f'$ has only isolated zeros. Rolle: $f$ continuous on $[a,b]$, differentiable on $(a,b)$, $f(a)=f(b)$ gives $f'(c)=0$ for some $c\in(a,b)$. Mean value theorem (same smoothness): $f'(c)=\frac{f(b)-f(a)}{b-a}$. Critical points: interior domain points with $f'=0$ or undefined. $f$ continuous at $c$: $f'$ changing $+$ to $-$ gives local max, $-$ to $+$ local min. If $f'(c)=0$: $f''(c)<0$ max, $>0$ min, $=0$ inconclusive. Tangent slope $f'(x_1)$; normal $-1/f'(x_1)$ if $f'(x_1)\ne0$. $\Delta y\approx f'(x)\Delta x$ for small $\Delta x$.
**Methods:** Optimisation: variable, constraint, one-variable function, feasible domain, justify extremum. Absolute extrema of continuous $f$ on $[a,b]$: compare critical values and endpoints. Related rates: differentiate the relation in $t$, substitute afterwards. Inequalities and root counts: study sign of $f'$.
**Common mistakes:** Assuming $f'=0$ means extremum ($x^3$). Missing corners and endpoints. Substituting instantaneous values before differentiating. Merging separate intervals of monotonicity.
**Teach it:** Ask: "Does $x^4$ have a minimum at $0$ although $f''(0)=0$?" (Yes.) Teach with a sign line of $f'$ beneath the graph.

## Indefinite integrals
Level: 12, JEE
Keywords: integration, antiderivative, indefinite integral, substitution, integration by parts, partial fractions, trigonometric substitution, standard integrals, completing square
**Key results:** On intervals in the domain, add $C$; $a>0$ below. $\int x^n=\frac{x^{n+1}}{n+1}$ ($n\ne-1$); $\int\frac1x=\ln|x|$; $\int a^x=\frac{a^x}{\ln a}$ ($a\ne1$). $\int\tan x=\ln|\sec x|$; $\int\cot x=\ln|\sin x|$; $\int\sec x=\ln|\sec x+\tan x|$; $\int\csc x=\ln|\csc x-\cot x|$. $\int\frac{dx}{x^2+a^2}=\frac1a\tan^{-1}\frac xa$; $\int\frac{dx}{x^2-a^2}=\frac1{2a}\ln\left|\frac{x-a}{x+a}\right|$; $\int\frac{dx}{\sqrt{a^2-x^2}}=\sin^{-1}\frac xa$; $\int\frac{dx}{\sqrt{x^2\pm a^2}}=\ln|x+\sqrt{x^2\pm a^2}|$; $\int\sqrt{a^2-x^2}\,dx=\frac x2\sqrt{a^2-x^2}+\frac{a^2}2\sin^{-1}\frac xa$; $\int uv'=uv-\int u'v$; $\int e^x(f+f')dx=e^xf$.
**Methods:** Look for a function with its derivative. Rational: divide if improper, then partial fractions. $\sqrt{a^2-x^2}$: $x=a\sin\theta$; $\sqrt{x^2+a^2}$: $a\tan\theta$; $\sqrt{x^2-a^2}$: $a\sec\theta$. By parts, usually choose $u$ in the order: log, inverse trig, algebraic, trig, exponential. Else $t=\tan\frac x2$.
**Common mistakes:** Dropping $C$, modulus or the factor from $ax+b$. Integrating a product factorwise.
**Teach it:** Ask: "$\int 2x\cos(x^2)\,dx$?" ($\sin x^2+C$.) Show substitution as the chain rule reversed and verify by differentiating.

## Definite integrals and area
Level: 12, JEE
Keywords: definite integral, properties of definite integrals, area under curve, area between curves, king property, leibniz rule, limit of a sum, even odd function, periodic integral
**Key results:** $f$ continuous on $[a,b]$, $F'=f$: $\int_a^bf=F(b)-F(a)$. $\int_a^bf(x)dx=\int_a^bf(a+b-x)dx$. $\int_0^{2a}f=\int_0^a[f(x)+f(2a-x)]dx$. $\int_{-a}^af=2\int_0^af$ ($f$ even), $0$ ($f$ odd). Period $T$, $n\in\mathbb Z$: $\int_a^{a+nT}f=n\int_0^Tf$. $f$ continuous, $u,v$ differentiable: $\frac d{dx}\int_{u}^{v}f(t)dt=f(v)v'-f(u)u'$. $m\le f\le M$, $a<b$: $m(b-a)\le\int_a^bf\le M(b-a)$. $\lim_{n\to\infty}\frac1n\sum_{r=1}^nf(r/n)=\int_0^1f$ ($f$ continuous). $I_n=\int_0^{\pi/2}\sin^nx\,dx=\frac{n-1}nI_{n-2}$ ($n\ge2$). Area between curves, $a<b$: $\int_a^b|f-g|dx$.
**Methods:** Try symmetry first, add $I$ to its reflected form. Split at zeros of moduli, jumps of $[x]$. Area: sketch, find intersections, pick vertical or horizontal strips.
**Common mistakes:** Not changing limits on substitution. Using the fundamental theorem across a discontinuity, e.g. $\int_{-1}^1x^{-2}dx$ diverges. Signed integral reported as area. Using a substitution that is not valid over the whole interval.
**Teach it:** Ask: "Is the area between $y=\sin x$ and the axis on $[0,2\pi]$ zero?" (No, $4$.) Show thin strips and their signs.

## Differential equations
Level: 12, JEE
Keywords: differential equation, order and degree, variable separable, homogeneous equation, linear differential equation, integrating factor, general solution, particular solution, bernoulli, growth and decay
**Key results:** Order: highest derivative present. Degree: its power once the equation is polynomial in derivatives; otherwise undefined. A general solution of an order-$n$ equation carries $n$ independent constants. Linear: $\frac{dy}{dx}+P(x)y=Q(x)$, $P,Q$ continuous: $\mu=e^{\int P\,dx}$, $y\mu=\int Q\mu\,dx+C$. Same form with $x,y$ swapped. Homogeneous: $\frac{dy}{dx}=F(y/x)$, put $y=vx$, so $y'=v+xv'$. Bernoulli $y'+Py=Qy^n$ ($n\ne0,1$): $z=y^{1-n}$ gives $z'+(1-n)Pz=(1-n)Q$. $\frac{dy}{dt}=ky\Rightarrow y=y_0e^{kt}$.
**Methods:** Classify: separable, then homogeneous, linear in $y$, linear in $x$, substitution such as $v=ax+by+c$, or an exact differential, e.g. $d(xy)=x\,dy+y\,dx$. Apply initial conditions at the end. To form an equation, differentiate as many times as there are independent constants and eliminate them.
**Common mistakes:** Not reducing to coefficient $1$ before finding $\mu$. Losing constant solutions when dividing. Adding $C$ late. Degree assigned when $\sin(y')$ appears.
**Teach it:** Ask: "Degree of $y''=\sqrt{1+y'}$?" ($2$ after squaring.) Derive the integrating factor as what turns the left side into $(\mu y)'$.

## Matrices and determinants
Level: 12, JEE
Keywords: matrix, determinant, inverse, adjoint, transpose, symmetric, skew symmetric, system of linear equations, cramer rule, cofactor, singular, cayley hamilton
**Key results:** $AB$ exists if columns of $A$ equal rows of $B$; generally $AB\ne BA$. $(AB)^T=B^TA^T$. $A=\frac{A+A^T}2+\frac{A-A^T}2$. $A,B$ of order $n$: $|AB|=|A||B|$, $|kA|=k^n|A|$, $|A^T|=|A|$; $A(\mathrm{adj}A)=(\mathrm{adj}A)A=|A|I$; $|\mathrm{adj}A|=|A|^{n-1}$ ($n\ge2$); $\mathrm{adj}(\mathrm{adj}A)=|A|^{n-2}A$ ($n\ge3$; $A$ if $n=2$). $A^{-1}=\mathrm{adj}A/|A|$ iff $|A|\ne0$; $(AB)^{-1}=B^{-1}A^{-1}$. Skew-symmetric of odd order: $|A|=0$. $2\times2$: $A^2-(\mathrm{tr}A)A+|A|I=O$. Square system $AX=B$: $|A|\ne0$ unique; $|A|=0$, $(\mathrm{adj}A)B\ne O$ none; $(\mathrm{adj}A)B=O$ none or infinitely many. $AX=O$ has nontrivial solutions iff $|A|=0$. Cramer ($D=|A|\ne0$): $x=D_x/D$, where $D_x$ has the $x$ column replaced by $B$; similarly $y,z$.
**Methods:** Row swap flips sign; scaling a row scales $\det$; adding a multiple of another row changes nothing. Make zeros, then expand. When $|A|=0$, row-reduce to decide. Powers: find a pattern or use the identity above.
**Common mistakes:** $\mathrm{adj}$ is the transposed cofactor matrix. $AB=O$ does not force $A=O$ or $B=O$. $|A+B|\ne|A|+|B|$.
**Teach it:** Ask: "$A$ is $3\times3$, $|A|=2$; find $|3A|$." ($54$.) Show each of three rows contributes a factor $3$.

## Vectors
Level: 12, JEE
Keywords: vector, dot product, cross product, scalar triple product, projection, unit vector, coplanar, collinear, area of parallelogram, vector triple product, position vector
**Key results:** $\vec a\cdot\vec b=|a||b|\cos\theta$, $|\vec a\times\vec b|=|a||b|\sin\theta$, $\theta\in[0,\pi]$, nonzero vectors; direction of $\vec a\times\vec b$ by right-hand rule, and $\vec a\times\vec b=-\vec b\times\vec a$. Unit vector $\hat a=\vec a/|a|$ ($\vec a\ne0$). Projection of $\vec a$ on $\vec b\ne0$: scalar $\frac{\vec a\cdot\vec b}{|b|}$, vector $\frac{\vec a\cdot\vec b}{|b|^2}\vec b$. Point dividing $\vec a,\vec b$ in $m:n$ internally: $\frac{m\vec b+n\vec a}{m+n}$. Parallelogram area $|\vec a\times\vec b|$ (sides) or $\frac12|\vec d_1\times\vec d_2|$ (diagonals). $[\vec a\,\vec b\,\vec c]=\vec a\cdot(\vec b\times\vec c)$: its modulus is parallelepiped volume, one sixth of it tetrahedron volume; zero iff coplanar. $\vec a\times(\vec b\times\vec c)=(\vec a\cdot\vec c)\vec b-(\vec a\cdot\vec b)\vec c$. $|\vec a\times\vec b|^2+(\vec a\cdot\vec b)^2=|a|^2|b|^2$.
**Methods:** Lengths: square and use dot products. Unknown vector: expand in three non-coplanar vectors, dot or cross with a known one. Collinear points: $\vec{AB}\times\vec{AC}=0$.
**Common mistakes:** Cancelling in $\vec a\cdot\vec b=\vec a\cdot\vec c$ or in cross equations. Cross product assumed associative. Angle taken between vectors not drawn tail to tail.
**Teach it:** Ask: "If $\vec a\cdot\vec b=0$, must one be zero?" (No, perpendicular.) Show dot as shadow, cross as spanned area.

## Three dimensional geometry
Level: 11, 12, JEE
Keywords: 3d geometry, direction cosines, direction ratios, equation of line in space, skew lines, shortest distance, equation of plane, distance from plane, angle between line and plane
**Key results:** Distance $\sqrt{\sum(x_2-x_1)^2}$. Direction cosines: $l^2+m^2+n^2=1$; ratios $(a,b,c)\ne0$ give $l=\pm a/\sqrt{a^2+b^2+c^2}$, etc. Line $\vec r=\vec a+\lambda\vec b$ ($\vec b\ne0$) or $\frac{x-x_1}a=\frac{y-y_1}b=\frac{z-z_1}c$ (a zero denominator means that numerator is zero). Acute angle between lines: $\cos\theta=\frac{|\vec b_1\cdot\vec b_2|}{|b_1||b_2|}$. Shortest distance, non-parallel: $\frac{|(\vec b_1\times\vec b_2)\cdot(\vec a_2-\vec a_1)|}{|\vec b_1\times\vec b_2|}$; parallel: $\frac{|\vec b\times(\vec a_2-\vec a_1)|}{|b|}$. Point $\vec p$ to line: $\frac{|(\vec p-\vec a)\times\vec b|}{|b|}$. Plane $ax+by+cz+d=0$, $\vec n=(a,b,c)\ne0$: point distance $\frac{|ax_1+by_1+cz_1+d|}{|n|}$; planes $\cos\theta=\frac{|\vec n_1\cdot\vec n_2|}{|n_1||n_2|}$; line-plane $\sin\phi=\frac{|\vec b\cdot\vec n|}{|b||n|}$.
**Methods:** Take a general point with parameter; foot of perpendicular: set (point difference)$\cdot\vec b=0$; image $=2\,$foot$-$point. Intersection: equate with different parameters and check all three.
**Common mistakes:** Same parameter for two lines. Reading ratios before making coefficients of $x,y,z$ equal to $1$. Assuming non-parallel lines meet.
**Teach it:** Ask: "Can two lines be neither parallel nor intersecting?" (Yes, skew.) Demonstrate with two pencils at different heights.

## Linear programming
Level: 12
Keywords: linear programming, lpp, objective function, constraints, feasible region, corner point method, maximise, minimise, unbounded region, optimal solution
**Key results:** Optimise $Z=ax+by$ subject to linear inequalities, commonly with $x,y\ge0$. The feasible region is convex. For a region with corner points, if an optimum exists it is attained at some corner. A nonempty bounded closed region has both maximum and minimum. If two corners give the same optimum, every point of the segment joining them does. Unbounded region: the largest corner value $M$ is the maximum only if $ax+by>M$ has no point in the feasible region; the smallest corner value $m$ is the minimum only if $ax+by<m$ has none. Empty region: no solution.
**Methods:** Define variables with units; translate "at most" as $\le$, "at least" as $\ge$. Draw each boundary line from intercepts, test a point (origin if not on the line), shade the common part. Solve the intersecting pairs for corners, tabulate $Z$. For unbounded regions, draw the extra half-plane test dashed and state the conclusion.
**Common mistakes:** Taking every intersection of lines as a corner, even infeasible ones. Reversing the shaded side. Omitting non-negativity. Declaring an optimum on an unbounded region without testing. Ignoring integer requirements for countable items.
**Teach it:** Ask: "Must $(0,0)$ always be feasible?" (No, e.g. $x+y\ge2$.) Slide the line $ax+by=k$ across the region: the last contact is the optimum and includes a corner.

## Statistics
Level: 10, 11, JEE
Keywords: statistics, mean, median, mode, grouped data, variance, standard deviation, mean deviation, ogive, cumulative frequency, step deviation, coefficient of variation
**Key results:** $N=\sum f_i$. Mean $\bar x=\frac{\sum f_ix_i}N=a+h\frac{\sum f_iu_i}N$, $u_i=\frac{x_i-a}h$, $h\ne0$. Continuous classes: median $l+\left(\frac{N/2-cf}f\right)h$ ($l$ lower boundary, $f$ frequency of median class, $cf$ cumulative frequency before it); mode $l+\frac{f_1-f_0}{2f_1-f_0-f_2}h$ ($l$ for modal class; $f_1$ its frequency, $f_0,f_2$ those before and after; equal widths, nonzero denominator). $h$ is class width. Empirical, only approximate for moderate skew: mode $\approx3$ median $-2$ mean. Mean deviation about $A$: $\frac{\sum f_i|x_i-A|}N$, least at the median. $\sigma^2=\frac{\sum f_i(x_i-\bar x)^2}N=\frac{\sum f_ix_i^2}N-\bar x^2$. If $y=ax+b$: $\bar y=a\bar x+b$, $\sigma_y=|a|\sigma_x$. Combined variance $\frac{\sum n_j(\sigma_j^2+d_j^2)}{\sum n_j}$, $d_j=\bar x_j-$ combined mean. First $n$ naturals: $\sigma^2=\frac{n^2-1}{12}$. CV $=100\sigma/\bar x$ ($\bar x>0$).
**Methods:** Wrong-observation problems: recover $\sum x$ and $\sum x^2$, correct, recompute. Make classes continuous first. On a less-than ogive, read the median at height $N/2$.
**Common mistakes:** Median without sorting. Using class limits instead of boundaries. Adding $b$ to the spread. Averaging means without weights.
**Teach it:** Ask: "Add $5$ to all data: what happens to $\sigma$?" (Unchanged.) Plot points on a line and shift them.

## Probability
Level: 10, 11, 12, JEE
Keywords: probability, sample space, conditional probability, independent events, mutually exclusive, bayes theorem, total probability, random variable, expectation, binomial distribution, dice cards coins
**Key results:** Equally likely finite outcomes: $P(A)=\frac{n(A)}{n(S)}$. $P(A')=1-P(A)$; $P(A\cup B)=P(A)+P(B)-P(A\cap B)$. $P(A|B)=\frac{P(A\cap B)}{P(B)}$, $P(B)>0$. Independent iff $P(A\cap B)=P(A)P(B)$; mutual independence of three needs all pairs and the triple. For mutually exclusive, exhaustive $E_i$ with $P(E_i)>0$: $P(A)=\sum P(E_i)P(A|E_i)$ and $P(E_k|A)=\frac{P(E_k)P(A|E_k)}{P(A)}$, $P(A)>0$. Discrete $X$: $\sum p_i=1$, $\mu=\sum x_ip_i$, $\mathrm{Var}=\sum x_i^2p_i-\mu^2$. Binomial ($n$ independent trials, constant $p$, $q=1-p$): $P(X=r)=\binom nrp^rq^{n-r}$, $r=0,\dots,n$; mean $np$, variance $npq$.
**Methods:** Fix the sample space; use a tree for stages; "at least one" $=1-P(\text{none})$. Count numerator and denominator the same way (ordered or unordered).
**Common mistakes:** Confusing $P(A|B)$ with $P(B|A)$. Confusing exclusive with independent. Binomial for draws without replacement. Treating dice sums as equally likely.
**Teach it:** Ask: "Two children, at least one a girl: chance both girls, assuming equal independent births?" ($1/3$.) Use natural frequencies in a tree to make Bayes visible.

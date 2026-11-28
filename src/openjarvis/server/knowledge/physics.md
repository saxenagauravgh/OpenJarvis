# Physics

## Units, Measurement and Errors
Level: 11, JEE
Keywords: dimensional analysis, dimensions, significant figures, percentage error, absolute error, relative error, error propagation, rounding off, si units, order of magnitude, unit conversion
**Key results:** Dimensional homogeneity is necessary, not sufficient. Unit change: $n_1u_1=n_2u_2$. For $Z=A\pm B$: $\Delta Z=\Delta A+\Delta B$. For $Z=A^aB^b/C^c$ (small, independent errors, worst case): $\frac{\Delta Z}{Z}=|a|\frac{\Delta A}{A}+|b|\frac{\Delta B}{B}+|c|\frac{\Delta C}{C}$. Mean absolute error: $\frac1n\sum|a_i-\bar a|$. Arguments of sin, log and exp are dimensionless.
**Methods:** To derive a relation, assume $Q=kx^ay^bz^c$ and match M, L, T powers; works only for product forms with no more unknown powers than independent equations. For errors in sums inside powers, treat the bracket first. Products and quotients keep the fewest significant figures; sums and differences keep the fewest decimal places. Round only at the end.
**Common mistakes:** Subtracting errors for a difference or quotient. Putting errors on pure constants like $2\pi$. Counting leading zeros as significant. Expecting dimensions to give numerical constants. Assuming equal dimensions mean same quantity (torque and work).
**Teach it:** Ask: "If $g=4\pi^2L/T^2$ and $L,T$ each have 1% error, what is the error in $g$?" (3%). Hardest idea is why errors add: choose the worst-case signs with numbers, then show powers repeat a factor, so its fractional error counts repeatedly.

## Kinematics
Level: 11, JEE
Keywords: motion in a straight line, projectile, relative velocity, equations of motion, velocity time graph, river boat problem, free fall, displacement, acceleration, circular motion, nth second
**Key results:** Constant $\vec a$ only: $v=u+at$, $s=ut+\tfrac12at^2$, $v^2=u^2+2as$, $s_n=u+\tfrac a2(2n-1)$ (displacement in nth second). Generally $v=dx/dt$, $a=dv/dt=v\,dv/dx$. Projectile (no drag, uniform $g$): $y=x\tan\theta-\frac{gx^2}{2u^2\cos^2\theta}$; same launch and landing level: $T=\frac{2u\sin\theta}{g}$, $H=\frac{u^2\sin^2\theta}{2g}$, $R=\frac{u^2\sin2\theta}{g}$. $\vec v_{AB}=\vec v_A-\vec v_B$. Circle: $a_c=v^2/r$, $a_t=d|\vec v|/dt$.
**Methods:** Fix a positive direction and sign every vector. Split 2D motion into independent axes sharing time. River width $d$, boat $v$, stream $u$: least time heads straight across, $t=d/v$; zero drift needs $v>u$, heading upstream of straight across by $\sin\alpha=u/v$. Graphs: slope of $x$-$t$ is velocity; area under $v$-$t$ is displacement. On inclines tilt axes.
**Common mistakes:** Distance versus displacement when velocity reverses. Average speed as the mean of speeds. Zero acceleration at the top. Constant-$a$ formulas for varying $a$.
**Teach it:** Ask: "A ball thrown up is at its highest point; what are $v$ and $a$?" For independence of axes, compare a dropped and a horizontally launched ball: equal heights at equal times.

## Laws of Motion and Friction
Level: 11, JEE
Keywords: newton's laws, free body diagram, friction, static friction, kinetic friction, inclined plane, pulley, tension, pseudo force, banking of roads, angle of repose, normal reaction
**Key results:** $\vec F_{net}=d\vec p/dt$; $=m\vec a$ for constant mass, inertial frame. $0\le f_s\le\mu_sN$; $f_k=\mu_kN$ opposes relative sliding. Repose: $\tan\theta=\mu_s$. Ideal Atwood ($m_1>m_2$): $a=\frac{(m_1-m_2)g}{m_1+m_2}$, $T=\frac{2m_1m_2g}{m_1+m_2}$. Frame with acceleration $\vec a_0$: add $-m\vec a_0$. Level turn: $v_{max}=\sqrt{\mu_srg}$. Banked: no friction $v^2=rg\tan\theta$; $v_{max}^2=rg\frac{\tan\theta+\mu_s}{1-\mu_s\tan\theta}$ ($\mu_s\tan\theta<1$, otherwise no upper limit); $v_{min}^2=rg\frac{\tan\theta-\mu_s}{1+\mu_s\tan\theta}$ ($\tan\theta>\mu_s$, else 0).
**Methods:** Draw one free body diagram per body, write constraint relations, then solve. For stacked blocks assume they move together, find the friction needed, compare with $\mu_sN$.
**Common mistakes:** Setting $N=mg$ always. Taking $f_s=\mu_sN$ when not limiting. Cancelling action-reaction pairs on one body. Adding centripetal force as an extra force.
**Teach it:** Ask: "A 10 N push fails to move a block with $\mu_sN=30$ N; what is the friction?" (10 N). Teach friction as a self-adjusting force opposing relative motion, with a graph of friction versus push.

## Work, Energy and Power
Level: 10, 11, JEE
Keywords: work energy theorem, kinetic energy, potential energy, conservation of energy, conservative force, spring energy, power, vertical circle, work done, equilibrium from potential energy
**Key results:** $W=\int\vec F\cdot d\vec r$. $W_{all}=\Delta K$ (particle, any forces, inertial frame). Conservative: $W_c=-\Delta U$, $F_x=-dU/dx$. $W_{nc}+W_{ext}=\Delta(K+U)$. Spring: $U=\tfrac12kx^2$, $x$ from natural length. $P=\vec F\cdot\vec v$. Vertical circle, light string radius $R$: complete loop needs $u_{bottom}\ge\sqrt{5gR}$, $v_{top}\ge\sqrt{gR}$, and $T_{bottom}-T_{top}=6mg$. Light rigid rod: $u_{bottom}\ge2\sqrt{gR}$.
**Methods:** Use energy when speeds and positions are asked, forces when time or tension is needed (often both). List forces and classify each. Stable equilibrium: $dU/dx=0$, $d^2U/dx^2>0$. Slack string: set $T=0$ in the radial equation and combine with energy.
**Common mistakes:** Counting gravity both as work and as potential energy. Assuming mechanical energy survives inelastic impacts. Thinking static friction never does work (in the ground frame it does work on a crate riding an accelerating truck). Using average force $\times$ distance for any variable force.
**Teach it:** Ask: "How much work do you do on a bag carried level at constant velocity?" (zero by the supporting force). Explain energy as bookkeeping: choose the system first, then only outside agents change its total.

## Centre of Mass, Momentum and Collisions
Level: 11, JEE
Keywords: centre of mass, linear momentum, impulse, collision, coefficient of restitution, elastic collision, inelastic collision, recoil, explosion, rocket, variable mass
**Key results:** $\vec r_{cm}=\sum m_i\vec r_i/M$; $M\vec a_{cm}=\vec F_{ext}$. A momentum component is conserved if external force along it is zero. $\vec J=\int\vec F\,dt=\Delta\vec p$. Along line of impact: $e=\frac{v_2-v_1}{u_1-u_2}$. 1D: $v_1=\frac{m_1u_1+m_2u_2-m_2e(u_1-u_2)}{m_1+m_2}$. $\Delta K_{lost}=\tfrac12\frac{m_1m_2}{m_1+m_2}(1-e^2)(u_1-u_2)^2$ (no spin). Rocket, no external force, constant exhaust speed $v_{rel}$ relative to rocket: $v-v_0=v_{rel}\ln(m_0/m)$. CM from centre: semicircular ring $2R/\pi$, disc $4R/3\pi$; hemisphere solid $3R/8$, shell $R/2$.
**Methods:** Collision: conserve momentum, then apply $e$. Smooth bodies: tangential velocity of each is unchanged. Removed parts: treat as negative mass. Bullet-pendulum: momentum during impact, energy afterwards.
**Common mistakes:** Conserving kinetic energy in sticking collisions. Sign errors in $e$. Ignoring large impulsive normal or tension forces. Expecting an explosion to alter CM motion (while no fragment meets a new external force).
**Teach it:** Ask: "A shell bursts mid-flight; where does its CM go?" Show internal forces cancel in pairs, so only external forces steer the CM.

## Rotational Motion
Level: 11, JEE
Keywords: moment of inertia, torque, angular momentum, rolling without slipping, parallel axis theorem, perpendicular axis theorem, radius of gyration, rigid body, angular velocity, toppling
**Key results:** $I$: ring $MR^2$, disc $MR^2/2$ (central normal axis); rod $ML^2/12$ (centre), $ML^2/3$ (end); solid sphere $\tfrac25MR^2$, shell $\tfrac23MR^2$. $I=I_{cm}+Md^2$; $I_z=I_x+I_y$ (planar lamina only). $\tau=I\alpha$ (rigid body, fixed axis or axis through CM of fixed direction). $\vec\tau_{ext}=d\vec L/dt$ about a fixed point or CM. Planar: $\vec L=\vec r_{cm}\times M\vec v_{cm}+I_{cm}\vec\omega$ (symmetric body). Pure rolling on fixed surface: $v=\omega R$, $K=\tfrac12Mv^2(1+k^2/R^2)$; incline: $a=\frac{g\sin\theta}{1+k^2/R^2}$, needs $\mu_s\ge\frac{\tan\theta}{1+R^2/k^2}$.
**Methods:** Pick the pivot that removes unknown forces. Equilibrium: $\sum F=0$, $\sum\tau=0$. Conserve $L$ about a point with zero external torque. Toppling: normal reaction reaches the edge.
**Common mistakes:** Using $f=\mu N$ in pure rolling. Assuming energy conserved when $I$ changes or during slipping. Parallel axis from a non-CM axis. Dropping the orbital term in $L$.
**Teach it:** Ask: "Ring or solid sphere: which rolls down first?" (sphere). Explain $I$ as how far mass sits from the axis: energy tied in spin is unavailable for translation.

## Gravitation
Level: 11, JEE
Keywords: gravitation, kepler's laws, escape velocity, orbital velocity, satellite, gravitational potential, acceleration due to gravity, geostationary, binary star, variation of g
**Key results:** $F=Gm_1m_2/r^2$ (points or spherically symmetric bodies). $g_h=g/(1+h/R)^2$, $\approx g(1-2h/R)$ if $h\ll R$; depth, uniform density: $g(1-d/R)$. Rotating spherical Earth: $g'\approx g-\omega^2R\cos^2\lambda$. $U=-GMm/r$. Circular orbit ($m\ll M$): $v=\sqrt{GM/r}$, $T^2=4\pi^2r^3/GM$, $E=-GMm/2r$; ellipse (semi-major axis $a$): $T^2=4\pi^2a^3/GM$, $E=-GMm/2a$, $dA/dt=L/2m$. Surface escape: $\sqrt{2GM/R}$ (no drag). Shell interior: field 0, $V=-GM/R$. Solid sphere interior: $V=-\frac{GM(3R^2-r^2)}{2R^3}$. Binary: $\omega^2=G(m_1+m_2)/d^3$.
**Methods:** For launches and transfers use energy; on ellipses combine energy with angular momentum at apogee and perigee. Superpose fields vectorially, potentials as scalars. Cavities: subtract a negative mass.
**Common mistakes:** Using $mgh$ for large $h$. Confusing height with orbital radius. Calling orbiting astronauts gravity-free (they are in free fall). Escape speed depending on launch direction in the ideal model.
**Teach it:** Ask: "Why does a satellite speed up when drag removes energy?" With $K=-E$, $U=2E$, lowering $E$ drops the orbit and raises $K$.

## Mechanical Properties of Solids
Level: 11, JEE
Keywords: elasticity, young's modulus, bulk modulus, shear modulus, stress, strain, hooke's law, poisson ratio, elastic energy, wire extension, thermal stress, breaking stress
**Key results:** Within proportional limit: $Y=\frac{F/A}{\Delta L/L}$, $\Delta L=\frac{FL}{AY}$, shear $G=\frac{F/A}{\phi}$, bulk $B=-V\frac{\Delta P}{\Delta V}$. Wire acts as spring $k=YA/L$. Energy per volume: $\tfrac12\times$ stress $\times$ strain. Uniform hanging rod under own weight: $\Delta L=\rho gL^2/2Y$. Poisson ratio $\sigma=-$lateral/longitudinal strain; isotropic: $Y=2G(1+\sigma)=3B(1-2\sigma)$, $-1<\sigma\le0.5$. Fully clamped rod, uniform heating: compressive stress $Y\alpha\Delta T$.
**Methods:** For varying tension, integrate $d(\Delta L)=T(x)\,dx/(AY)$. Wires in series share force; in parallel with equal length change share load in ratio of $YA/L$. For compound rods set total length change to match the constraint.
**Common mistakes:** Using diameter as radius. Thinking breaking force depends on length (ignoring self-weight it depends on area and material). Thinking $Y$ changes with wire dimensions. Applying Hooke's law beyond the proportional limit.
**Teach it:** Ask: "Cut a wire in half: what happens to $Y$ and to its stiffness?" ($Y$ same, $k$ doubles). Picture a chain of identical springs to separate material property from object property.

## Fluid Mechanics and Surface Tension
Level: 11, JEE
Keywords: pressure, pascal's law, buoyancy, archimedes principle, bernoulli equation, continuity equation, viscosity, terminal velocity, surface tension, capillary rise, excess pressure, torricelli
**Key results:** Static, uniform density: $P=P_0+\rho gh$. Buoyancy $=\rho_fV_{sub}g_{eff}$. Steady incompressible: $Av$ constant; also non-viscous, along a streamline: $P+\tfrac12\rho v^2+\rho gh$ constant. Small hole at depth $h$, surface and jet at atmospheric pressure: $v=\sqrt{2gh}$. Sphere, laminar, wide medium: $F=6\pi\eta rv$, $v_t=\frac{2r^2(\rho-\sigma)g}{9\eta}$ ($\rho$ sphere, $\sigma$ fluid density). Laminar pipe: $Q=\frac{\pi r^4\Delta P}{8\eta L}$. $Re=\rho vD/\eta$. Excess pressure: drop or cavity $2S/r$, soap bubble $4S/r$. Narrow tube: $h=\frac{2S\cos\theta}{\rho gr}$. Surface energy change $S\Delta A$. Rotating liquid: $y=\omega^2x^2/2g$.
**Methods:** Equate pressures at one level in the same connected static fluid. Floating: weight equals buoyancy. Accelerating tank: surface tilts, $\tan\theta=a/g$ (horizontal $a$). Pair Bernoulli with continuity.
**Common mistakes:** Using object density in buoyancy. Bernoulli across pumps or viscous flow. One surface for a bubble in liquid counted as two. Mixing gauge and absolute pressure.
**Teach it:** Ask: "Ice floats in a full glass; after melting, does water overflow?" (no, pure water). Derive buoyancy from the pressure difference between bottom and top faces.

## Thermal Properties and Heat Transfer
Level: 11, JEE
Keywords: thermal expansion, calorimetry, specific heat, latent heat, conduction, convection, radiation, stefan law, wien law, newton's law of cooling, temperature scales
**Key results:** $\frac{C}{5}=\frac{F-32}{9}$, $K=C+273.15$. Small $\Delta T$: $\Delta L=\alpha L\Delta T$; isotropic $\beta\approx2\alpha$, $\gamma\approx3\alpha$. $\gamma_{apparent}\approx\gamma_{liquid}-\gamma_{vessel}$. $Q=mc\Delta T$; phase change $Q=mL$. Steady 1D conduction, no side loss: $H=KA\Delta T/L$, $R=L/KA$ (series, parallel like resistors). Net radiation from convex body in large enclosure: $P=e\sigma A(T^4-T_0^4)$. $\lambda_mT=2.9\times10^{-3}$ m K (blackbody). Cooling, small excess: $dT/dt=-k(T-T_0)$. Kirchhoff: emissivity equals absorptivity at same wavelength and temperature.
**Methods:** Calorimetry: first test whether all ice melts or steam condenses, then balance heat. Junction temperatures: heat currents sum to zero. Holes expand like the material.
**Common mistakes:** Celsius in radiation laws. Forgetting latent heat or vessel capacity. Thinking holes shrink on heating. Ignoring that water is densest at about $4\,^\circ$C.
**Teach it:** Ask: "Mix 10 g ice at $0\,^\circ$C with 10 g water at $20\,^\circ$C: final state?" (0 degrees, ice partly melted). Use a heat budget: what is available versus what each stage costs.

## Thermodynamics
Level: 11, JEE
Keywords: first law, second law, isothermal, adiabatic, isobaric, isochoric, carnot engine, efficiency, refrigerator, pv diagram, polytropic, internal energy
**Key results:** $Q=\Delta U+W$, $W$ done BY gas (chemistry often uses work on gas). Quasi-static: $W=\int PdV$. Ideal gas, any process: $\Delta U=nC_V\Delta T$; $C_P-C_V=R$. Reversible isothermal: $W=nRT\ln(V_2/V_1)$. Reversible adiabatic, ideal gas, constant $\gamma$: $PV^\gamma$, $TV^{\gamma-1}$ constant; $W=\frac{nR(T_1-T_2)}{\gamma-1}$. $PV^x$ constant ($x\ne1$): $C=C_V+\frac{R}{1-x}$. $\eta=W/Q_{in}$; Carnot (reversible, two reservoirs, kelvin) $1-T_c/T_h$. Carnot refrigerator COP $=T_c/(T_h-T_c)$; heat pump COP is that plus 1. Second law: no cyclic device can only turn heat from one reservoir into work, or only move heat from cold to hot.
**Methods:** Tabulate $Q,W,\Delta U$ per leg; $\Delta U=0$ over a cycle. Clockwise $P$-$V$ loop gives positive net work. $Q_{in}$ includes only absorbing parts.
**Common mistakes:** Applying $PV^\gamma$ to free expansion into vacuum (insulated, ideal gas: $Q=W=\Delta U=0$). Using $Q=nC_V\Delta T$ for all processes. Isothermal meaning no heat. Celsius in efficiency.
**Teach it:** Ask: "A gas expands isothermally; where does the work energy come from?" (heat absorbed). Contrast state functions with path quantities using two routes between the same points on a $P$-$V$ graph.

## Kinetic Theory of Gases
Level: 11, JEE
Keywords: ideal gas equation, rms speed, most probable speed, degrees of freedom, equipartition, mean free path, molar specific heat, gas mixture, dalton's law, kinetic energy of molecules
**Key results:** Ideal gas: $PV=nRT=Nk_BT$, $P=\tfrac13\rho v_{rms}^2$. Maxwell equilibrium: $v_{rms}=\sqrt{3RT/M}$, $\bar v=\sqrt{8RT/\pi M}$, $v_p=\sqrt{2RT/M}$ ($M$ in kg/mol). Translational KE per molecule $\tfrac32k_BT$. Each active quadratic term gets $\tfrac12k_BT$: $U=\tfrac f2nRT$, $C_V=\tfrac f2R$, $\gamma=1+\tfrac2f$. $f=3$ monatomic, 5 rigid diatomic, 7 with one vibration fully excited. $\lambda=\frac{1}{\sqrt2\pi d^2n_v}$, $n_v$ number density. Non-reacting mix: $C_V=\frac{\sum n_iC_{Vi}}{\sum n_i}$, $P=\sum P_i$.
**Methods:** Compare speeds using $\sqrt{T/M}$. Connected vessels: conserve moles; at constant total internal energy use $\sum n_iC_{Vi}T_i$. Mixtures: average $C_V$, then $\gamma=1+R/C_V$.
**Common mistakes:** Molar mass in grams. Averaging $\gamma$ directly. Thinking heavier molecules have more mean KE at the same $T$. Adding vibrational modes at ordinary temperature without being told.
**Teach it:** Ask: "At equal $T$, compare mean KE and rms speed of H$_2$ and O$_2$." (equal; 4:1). Derive pressure from momentum delivered by wall collisions, then link it to temperature.

## Oscillations and Simple Harmonic Motion
Level: 11, JEE
Keywords: simple harmonic motion, shm, time period, simple pendulum, spring mass system, amplitude, phase, damped oscillation, resonance, physical pendulum, springs in series
**Key results:** SHM iff $a=-\omega^2x$ ($x$ from equilibrium): $x=A\sin(\omega t+\phi)$, $v=\pm\omega\sqrt{A^2-x^2}$, $E=\tfrac12m\omega^2A^2$; $K,U$ vary at twice the frequency. Ideal spring: $T=2\pi\sqrt{m/k}$; series $1/k=\sum1/k_i$, parallel $k=\sum k_i$; uniform spring $k\propto1/\ell$. Two free masses: use $\mu=\frac{m_1m_2}{m_1+m_2}$. Small angles: pendulum $2\pi\sqrt{L/g_{eff}}$, $\vec g_{eff}=\vec g-\vec a$; physical $2\pi\sqrt{I/mgd}$ ($I$ about pivot, $d$ pivot to CM). Floating upright cylinder $2\pi\sqrt{m/\rho Ag}$; U-tube $2\pi\sqrt{\ell/2g}$ ($\ell$ liquid length, uniform tube). Light damping: amplitude $\propto e^{-bt/2m}$, $\omega'=\sqrt{k/m-b^2/4m^2}$.
**Methods:** Find equilibrium, displace by $x$, get restoring force or torque; or differentiate total energy. Use a reference circle for time intervals.
**Common mistakes:** Time proportional to distance. Gravity changing a vertical spring's period (it only shifts equilibrium). Mixing angular amplitude with $\omega$.
**Teach it:** Ask: "Time from mean position to $A/2$?" ($T/12$). Show SHM as the shadow of uniform circular motion, making phase a visible angle.

## Waves and Sound
Level: 11, JEE
Keywords: wave equation, speed of sound, standing waves, organ pipe, string harmonics, beats, doppler effect, superposition, resonance tube, intensity, decibel, wavelength
**Key results:** $y=A\sin(kx-\omega t+\phi)$ moves $+x$; $v=\omega/k=f\lambda$. String (small amplitude) $v=\sqrt{T/\mu}$; fluid $\sqrt{B/\rho}$; ideal gas $\sqrt{\gamma RT/M}$. Coherent: $I=I_1+I_2+2\sqrt{I_1I_2}\cos\phi$. String fixed both ends or open pipe: $f_n=nv/2L$; closed pipe: $(2n-1)v/4L$; end correction about $0.6r$ per open end. Beat frequency $|f_1-f_2|$ (close values). Reflection: phase flips by $\pi$ at a fixed end, not at a free end. Isotropic, lossless: $I=P/4\pi r^2$; level $10\log_{10}(I/I_0)$ dB, $I_0=10^{-12}$ W/m$^2$. Doppler along joining line, still medium: $f'=f\frac{v+v_o}{v-v_s}$, $v_o,v_s$ positive when toward the other, $v_s<v$.
**Methods:** Frequency stays fixed across boundaries. Reflecting wall: first treat it as observer, then as source. Wind adds to $v$ along sound direction.
**Common mistakes:** Particle speed confused with wave speed. Calling first overtone the second harmonic in a closed pipe (it is the third). Displacement node is pressure antinode. Adding decibels.
**Teach it:** Ask: "Wax is put on a tuning fork: what happens to its frequency?" (falls). For standing waves, animate two opposite waves: nodes stay, energy has no net transport.

## Electric Charges, Fields and Potential
Level: 12, JEE
Keywords: coulomb's law, electric field, gauss law, electric flux, electric potential, dipole, conductor, equipotential, charged sphere, line charge, electrostatics, potential energy
**Key results:** $k=1/4\pi\varepsilon_0$. Static point charges in vacuum: $F=kq_1q_2/r^2$, $U=kq_1q_2/r$. $\oint\vec E\cdot d\vec A=q_{enc}/\varepsilon_0$ (always true). Infinite line $\lambda/2\pi\varepsilon_0r$; infinite thin sheet $\sigma/2\varepsilon_0$; just outside conductor $\sigma/\varepsilon_0$. Uniform shell: inside $E=0$, $V=kQ/R$; outside as a point charge. Uniform solid sphere inside: $E=kQr/R^3$, $V=kQ(3R^2-r^2)/2R^3$. Ring axis: $E=kQx/(x^2+R^2)^{3/2}$. Dipole ($r\gg$ size): axial $E=2kp/r^3$ along $\vec p$, equatorial $kp/r^3$ opposite; $V=kp\cos\theta/r^2$; uniform field $\vec\tau=\vec p\times\vec E$, $U=-\vec p\cdot\vec E$. $\vec E=-\nabla V$; $W_{ext}=q\Delta V$ (no KE change).
**Methods:** Use Gauss for planar, cylindrical, spherical symmetry; otherwise integrate. Conductors: zero interior field, cavity charge induces equal opposite charge on cavity wall; grounding sets $V=0$.
**Common mistakes:** $E=0$ implying $V=0$. Zero flux implying zero field. Adding fields as scalars. Dropping charge signs in potential.
**Teach it:** Ask: "A charge sits outside a closed surface: net flux and field on it?" (zero; nonzero). Count field lines entering and leaving.

## Capacitance
Level: 12, JEE
Keywords: capacitor, parallel plate capacitor, dielectric, capacitors in series, capacitors in parallel, energy stored, charge sharing, rc circuit, time constant, capacitance
**Key results:** $C=Q/V$. Series $1/C=\sum1/C_i$ (equal charge if initially uncharged, no extra charge on junctions); parallel $C=\sum C_i$. Parallel plates (gap $\ll$ size): $\varepsilon_0A/d$; filled: times $K$; slab thickness $t$: $\frac{\varepsilon_0A}{d-t+t/K}$ (metal slab: $K\to\infty$). Isolated sphere $4\pi\varepsilon_0R$; concentric, outer earthed $\frac{4\pi\varepsilon_0ab}{b-a}$; coaxial $\frac{2\pi\varepsilon_0\ell}{\ln(b/a)}$. $U=\tfrac12CV^2=Q^2/2C$; vacuum $u=\tfrac12\varepsilon_0E^2$. Plate attraction $Q^2/2\varepsilon_0A$. Joining like plates: $V=\frac{C_1V_1+C_2V_2}{C_1+C_2}$, loss $\frac{C_1C_2(V_1-V_2)^2}{2(C_1+C_2)}$. RC from uncharged: $q=C\mathcal E(1-e^{-t/RC})$; discharge $q_0e^{-t/RC}$.
**Methods:** Battery connected: $V$ fixed; isolated: $Q$ fixed. Use node potentials and charge conservation on isolated plates; spot symmetry and balanced bridges. Energy audit: battery work $\mathcal E\Delta q$ = change in $U$ + heat + mechanical work.
**Common mistakes:** Series and parallel rules swapped with resistors. Opposite-polarity joining without a minus sign. Reversing RC limits (an uncharged capacitor first acts as a short; at DC steady state, as open).
**Teach it:** Ask: "Insert a dielectric after disconnecting the battery: $V$ and $U$?" (both fall by $K$). Explain polarisation making an opposing field.

## Current Electricity
Level: 10, 12, JEE
Keywords: ohm's law, resistance, resistivity, drift velocity, kirchhoff laws, internal resistance, wheatstone bridge, meter bridge, potentiometer, electric power, cells in series and parallel, domestic circuit
**Key results:** $I=neAv_d$; $\vec J=\sigma\vec E$ (ohmic); $\rho=m/ne^2\tau$; $R=\rho\ell/A$ (uniform). $\rho=\rho_0(1+\alpha\Delta T)$ over limited range. Cell: $V=\mathcal E-Ir$ discharging, $\mathcal E+Ir$ charging. Parallel cells, like poles joined: $\mathcal E_{eq}=\frac{\sum\mathcal E_i/r_i}{\sum1/r_i}$, $\frac1{r_{eq}}=\sum\frac1{r_i}$ (reversed cell: $\mathcal E$ negative). Series: $\mathcal E$ add with sign, $r$ add. Load power max at $R=r$ (variable $R$). Balanced bridge $P/Q=R/S$ ($P,Q$ in one branch, $R,S$ in the other, $P,R$ at the same supply node). Metre bridge $R/S=\ell/(100-\ell)$ ($\ell$ in cm from the $R$ end). Potentiometer: $\mathcal E_1/\mathcal E_2=\ell_1/\ell_2$ (same wire current). $P=VI$; resistor $I^2R=V^2/R$. 1 kWh $=3.6\times10^6$ J.
**Methods:** Reduce series/parallel; else node potentials. Use symmetry. Bulbs: find $R=V_r^2/P_r$ (assumed constant). Home wiring: appliances in parallel, fuse in live wire, earth to metal body.
**Common mistakes:** Current "used up" in resistors. Forgetting that stretching keeps volume fixed, so $R\propto\ell^2$. Expecting the higher-wattage bulb to glow brighter in series (same voltage rating: lower wattage is brighter). Sign slips in loops.
**Teach it:** Ask: "Compare current before and after a bulb." (same). Charges carry energy, which is what drops; potential is like height around a circuit.

## Moving Charges and Magnetism
Level: 10, 12, JEE
Keywords: lorentz force, magnetic field, biot savart law, ampere law, solenoid, cyclotron, force on conductor, magnetic moment, galvanometer, ammeter voltmeter conversion, fleming left hand rule
**Key results:** $\vec F=q(\vec E+\vec v\times\vec B)$. Uniform $B$, non-relativistic: $r=mv_\perp/|q|B$, $T=2\pi m/|q|B$, pitch $v_\parallel T$. Wire, uniform field: $I\vec L\times\vec B$ ($\vec L$ end to end). $d\vec B=\frac{\mu_0I}{4\pi}\frac{d\vec l\times\hat r}{r^2}$. Long wire $\mu_0I/2\pi r$; segment $\frac{\mu_0I}{4\pi d}(\sin\theta_1+\sin\theta_2)$, angles from the perpendicular to the two ends, on opposite sides of its foot (one negative if same side); arc centre $\mu_0I\phi/4\pi R$ ($\phi$ in radians); coil axis $\frac{\mu_0NIR^2}{2(R^2+x^2)^{3/2}}$. Long solenoid $\mu_0nI$; toroid $\mu_0NI/2\pi r$. Parallel currents attract, antiparallel repel: $F/\ell=\mu_0I_1I_2/2\pi d$. $\vec m=NI\vec A$, $\vec\tau=\vec m\times\vec B$, $U=-\vec m\cdot\vec B$. Shunt $S=\frac{I_gG}{I-I_g}$; series $R=V/I_g-G$. Galvanometer, radial field: $NIAB=k\theta$.
**Methods:** Steady current, high symmetry: $\oint\vec B\cdot d\vec l=\mu_0I_{enc}$. Selector (perpendicular fields): $v=E/B$. Cyclotron $K_{max}=q^2B^2R^2/2m$.
**Common mistakes:** Forgetting to reverse force for negative charge. Letting the magnetic force do work on a point charge. Using full $v$ in radius.
**Teach it:** Ask: "Can a magnetic field alone change a particle's speed?" Force stays perpendicular to velocity, so it only turns.

## Magnetism and Matter
Level: 10, 12, JEE
Keywords: bar magnet, diamagnetic, paramagnetic, ferromagnetic, susceptibility, permeability, hysteresis, curie temperature, magnetisation, earth's magnetism, angle of dip
**Key results:** Short magnet ($r\gg$ length): axial $B=\frac{\mu_0}{4\pi}\frac{2m}{r^3}$ along $\vec m$; equatorial $\frac{\mu_0}{4\pi}\frac{m}{r^3}$ opposite. $\oint\vec B\cdot d\vec A=0$. $\vec B=\mu_0(\vec H+\vec M)$; linear material: $\vec M=\chi\vec H$, $\mu_r=1+\chi$. Diamagnet: small $\chi<0$ (ideal superconductor $-1$). Paramagnet: small $\chi>0$, $\chi=C/T$ (weak field, not very low $T$). Ferromagnet: large, nonlinear; above $T_C$, $\chi=C/(T-T_C)$. Earth: $B_H=B\cos\delta$, $B_V=B\sin\delta$; apparent dip $\tan\delta'=\tan\delta/\cos\alpha$ (dip-circle plane at $\alpha$ to magnetic meridian). Small swings: $T=2\pi\sqrt{I/mB}$ ($I$ moment of inertia, $B$ field in swing plane).
**Methods:** Add magnet and Earth fields as vectors to locate neutral points. Cut magnet: cut across length halves $m$ (pole strength same); cut along length halves pole strength and $m$. Hysteresis: read retentivity and coercivity; $B$-$H$ loop area is loss per volume per cycle.
**Common mistakes:** Expecting isolated poles. Field lines stopping at poles (they close inside). Soft iron versus steel uses swapped: electromagnets need low coercivity and loss; permanent magnets high coercivity.
**Teach it:** Ask: "Which way does a diamagnetic rod move in a non-uniform field?" (toward weaker field). Contrast induced opposing moments with alignment of existing moments and domains.

## Electromagnetic Induction
Level: 10, 12, JEE
Keywords: faraday law, lenz law, magnetic flux, induced emf, motional emf, self inductance, mutual inductance, lr circuit, eddy currents, induced electric field, rotating rod
**Key results:** $\Phi=\int\vec B\cdot d\vec A$, $\mathcal E=-N\,d\Phi/dt$. Motional $\int(\vec v\times\vec B)\cdot d\vec l$; $=B\ell v$ if mutually perpendicular. Rod about one end, $B$ along axis: $\tfrac12B\omega\ell^2$. Coil in uniform $B$, area vector at angle $\omega t$: $\mathcal E=NBA\omega\sin\omega t$. Closed circuit: $|\Delta q|=N|\Delta\Phi|/R$. $\oint\vec E\cdot d\vec l=-d\Phi/dt$; cylindrical uniform field radius $R$: $E=\frac r2|dB/dt|$ inside, $\frac{R^2}{2r}|dB/dt|$ outside. Long solenoid $L=\mu_0N^2A/\ell$, $M=\mu_0N_1N_2A/\ell$ ($A$ of inner coil). $M=k\sqrt{L_1L_2}$, $0\le k\le1$. $U=\tfrac12LI^2$, $u=B^2/2\mu_0$. LR growth $I_0(1-e^{-Rt/L})$, decay $I_0e^{-Rt/L}$, $I_0=\mathcal E/R$.
**Methods:** Get direction by Lenz, magnitude by Faraday. Sliding rod: emf, current, force $BI\ell$, equation of motion; check power balance. Inductor current cannot jump.
**Common mistakes:** Emf from large flux rather than changing flux. Thinking Lenz opposes the field (it opposes change). Expecting current in an open loop (emf only).
**Teach it:** Ask: "A magnet is pulled away from a ring: does the ring attract or repel it?" (attract). Link Lenz to energy conservation.

## Alternating Current
Level: 12, JEE
Keywords: alternating current, rms value, reactance, impedance, lcr circuit, resonance, quality factor, power factor, transformer, lc oscillations, phasor
**Key results:** Sinusoid: $I_{rms}=I_0/\sqrt2$; half-cycle mean $2I_0/\pi$. $X_L=\omega L$ (voltage leads current $90^\circ$), $X_C=1/\omega C$ (voltage lags $90^\circ$). Series LCR steady state: $Z=\sqrt{R^2+(X_L-X_C)^2}$, $\tan\phi=(X_L-X_C)/R$ (voltage ahead by $\phi$). Resonance $\omega_0=1/\sqrt{LC}$, $Z=R$; $Q=\omega_0L/R=\omega_0/\Delta\omega$, half-power width $\Delta\omega=R/L$. $P_{avg}=V_{rms}I_{rms}\cos\phi$, $\cos\phi=R/Z$. Ideal LC: $\frac{q^2}{2C}+\tfrac12LI^2$ constant. Ideal transformer: $V_s/V_p=N_s/N_p$, $V_pI_p=V_sI_s$.
**Methods:** Add voltages as phasors. In series take current as reference, in parallel take voltage. General waveform: rms is root of mean square. Transmission loss $I^2R_{line}$ falls with high voltage.
**Common mistakes:** Adding rms voltages arithmetically. Mixing $f$ with $\omega$. Expecting pure $L$ or $C$ to dissipate average power. Transformer on steady DC. Peak confused with rms.
**Teach it:** Ask: "Can the voltage across $C$ exceed the source voltage?" (yes, near resonance if $Q>1$). Use rotating phasors: $L$ and $C$ voltages point opposite and cancel.

## Electromagnetic Waves
Level: 12, JEE
Keywords: electromagnetic waves, displacement current, maxwell equations, electromagnetic spectrum, radiation pressure, intensity of light, speed of light, poynting, x rays, microwaves, ultraviolet
**Key results:** $I_d=\varepsilon_0\,d\Phi_E/dt$; $\oint\vec B\cdot d\vec l=\mu_0(I_c+I_d)$. Linear medium: $v=1/\sqrt{\mu\varepsilon}=c/\sqrt{\mu_r\varepsilon_r}$. Plane wave in vacuum: $E_0=cB_0$, $\vec E,\vec B$ in phase, mutually perpendicular, travel along $\vec E\times\vec B$. Average $u=\tfrac12\varepsilon_0E_0^2$, shared equally by $E$ and $B$; $I=uc=\tfrac12\varepsilon_0cE_0^2$. Normal incidence: momentum $U/c$ absorbed, $2U/c$ perfectly reflected; pressure $I/c$ or $2I/c$. Increasing frequency: radio, microwave, infrared, visible (about 400-700 nm), ultraviolet, X, gamma (X and gamma ranges overlap).
**Methods:** From $E=E_0\sin(kx-\omega t)$ along $\hat y$: travel $+x$, $\vec B$ along $\hat z$, $c=\omega/k$. Charging capacitor: $I_d$ between plates equals wire current; inside radius $r<R$, $B=\mu_0Ir/2\pi R^2$ (circular plates, no fringing).
**Common mistakes:** Displacement current as moving charge. Using peak where rms is needed. Changing frequency on entering a medium. Wrong direction of $\vec B$.
**Teach it:** Ask: "Between charging plates no charge crosses, so what makes $B$?" Apply Ampere's loop with two surfaces to show the missing term is changing electric flux.

## Ray Optics
Level: 10, 12, JEE
Keywords: reflection, refraction, spherical mirror, lens formula, lens maker formula, total internal reflection, prism, refractive index, magnification, power of lens, apparent depth, sign convention
**Key results:** Cartesian: measure from pole or optical centre; along incident light positive, heights up positive. Paraxial: mirror $\frac1v+\frac1u=\frac1f$, $f=R/2$, $m=-v/u$; thin lens $\frac1v-\frac1u=\frac1f$, $m=v/u$; surface (light from $n_1$ into $n_2$) $\frac{n_2}{v}-\frac{n_1}{u}=\frac{n_2-n_1}{R}$. Same medium both sides: $\frac1f=(\frac{n_l}{n_m}-1)(\frac1{R_1}-\frac1{R_2})$. $P=1/f$ (metres, in air); contact: powers add; coaxial, separation $d$ in air: $P=P_1+P_2-dP_1P_2$ (equivalent focal length; image position needs principal planes or step-by-step). $n_1\sin i=n_2\sin r$. TIR: denser to rarer, $i>i_c$, $\sin i_c=n_2/n_1$. Near-normal view from air: depth $d/n$. Prism: $\delta=i+e-A$, $r_1+r_2=A$; $n_{rel}=\frac{\sin((A+\delta_m)/2)}{\sin(A/2)}$; thin $\delta\approx(n_{rel}-1)A$. Two lens positions: $f=\frac{D^2-d^2}{4D}$ ($D>4f$; $D$ object to screen, $d$ between positions).
**Methods:** Chain surfaces: each image is next object; shift origin. Silvered lens: $P_{eq}=2P_L+P_M$, $P_M=-1/f_M$; equivalent mirror $f=-1/P_{eq}$.
**Common mistakes:** Signing unknowns in advance. Swapping mirror and lens formulas. Thinking a half-covered lens loses half the image (only brightness drops).
**Teach it:** Ask: "Can a convex lens diverge light?" (yes, in a denser medium). Draw two principal rays before algebra.

## Human Eye and Optical Instruments
Level: 10, 12, JEE
Keywords: human eye, myopia, hypermetropia, presbyopia, astigmatism, accommodation, microscope, telescope, magnifying power, dispersion, scattering of light, resolving power
**Key results:** Normal near point $D\approx25$ cm, far point infinity. Spectacles at the eye: myopia with far point distance $x$: concave, $f=-x$. Hypermetropia with near point $y$: convex, $\frac1f=\frac1{25}-\frac1y$ (cm). Magnifier: $1+D/f$ (image at $D$), $D/f$ (infinity). Compound microscope magnitude, final image at infinity: $\approx\frac{L}{f_o}\frac{D}{f_e}$ ($L$ tube length between inner focal points). Telescope: $f_o/f_e$, length $f_o+f_e$ (normal adjustment); image at $D$: $\frac{f_o}{f_e}(1+\frac{f_e}{D})$. Limits: telescope $\theta=1.22\lambda/a$ ($a$ aperture diameter); microscope $d_{min}=1.22\lambda/(2n\sin\beta)$. Rayleigh scattering $\propto1/\lambda^4$ (particles $\ll\lambda$). Presbyopia (weak accommodation): reading or bifocal lenses; astigmatism: cylindrical lens. Dispersion in glass: violet deviates most; thin prism spread $(n_v-n_r)A$.
**Methods:** Corrective lens must form a virtual image of the desired object at the eye's own far or near point. Instruments: solve eyepiece and objective in turn.
**Common mistakes:** Mixing cm and dioptre. Large objective said to raise telescope magnification (it improves resolution and brightness). Blue sky explained by reflection.
**Teach it:** Ask: "Which lens helps someone who cannot see distant boards?" (concave). Show where rays focus relative to the retina, before and after.

## Wave Optics
Level: 12, JEE
Keywords: interference, young's double slit, ydse, fringe width, diffraction, single slit, polarisation, brewster angle, malus law, huygens principle, coherent sources, path difference
**Key results:** Coherent in-phase slits: bright $\Delta=n\lambda$, dark $(n+\tfrac12)\lambda$; $\Delta=d\sin\theta\approx yd/D$ ($D\gg d$; small angle for second form), $\beta=\lambda D/d$. Equal slit intensities $I_0$: $I=4I_0\cos^2(\phi/2)$, $\phi=2\pi\Delta/\lambda$. In medium $\beta'=\beta/n$. Sheet ($n,t$, in air) over one slit shifts pattern toward it by $(n-1)tD/d$. Single slit (far field): minima $a\sin\theta=n\lambda$, $n\ne0$; secondary maxima near $(n+\tfrac12)\lambda$; central width $2\lambda D/a$ (small angle). Polaroid on unpolarised light: $I/2$; then Malus $I\cos^2\theta$. Brewster $\tan i_p=n_2/n_1$; reflected and refracted rays perpendicular.
**Methods:** Compute total optical path difference including source side and sheets. Overlapping bright fringes: $m_1\lambda_1=m_2\lambda_2$ (integers $m$). Intensity: convert path to phase.
**Common mistakes:** Using small-angle fringe formulas at large angles. Confusing single-slit minima with double-slit maxima condition. Independent lamps giving steady fringes. Thinking sound in air can be polarised.
**Teach it:** Ask: "In white-light YDSE, what colour is the central fringe?" (white). Add two phasors to show energy is redistributed, not destroyed.

## Dual Nature of Radiation and Matter
Level: 12, JEE
Keywords: photoelectric effect, work function, stopping potential, threshold frequency, photon, de broglie wavelength, einstein equation, matter waves, photocurrent, radiation pressure
**Key results:** Photon $E=hf=hc/\lambda$, $p=h/\lambda$; $hc\approx1240$ eV nm. Single-photon emission: $K_{max}=hf-\phi=eV_0$, requires $f\ge f_0=\phi/h$. Fixed frequency above threshold: saturation current $\propto$ intensity. Photon rate $P\lambda/hc$. de Broglie $\lambda=h/p$; non-relativistic $h/\sqrt{2mK}$; electron from rest through $V$ volts: $\lambda\approx1.227/\sqrt V$ nm. Particle of rms thermal speed: $h/\sqrt{3mk_BT}$. Force from beam of power $P$, normal incidence, reflectance $\rho$, rest absorbed: $(1+\rho)P/c$.
**Methods:** $V_0$ against $f$: slope $h/e$, intercept $-\phi/e$. Two wavelengths: subtract equations to eliminate $\phi$. Compare $\lambda$ at equal $K$, $p$ or $V$, noting mass and charge. Isolated metal sphere charges until potential equals $V_0$.
**Common mistakes:** Intensity raising $K_{max}$. Expecting the same photon rate at higher $f$ and equal intensity (it is lower). Using $\lambda=hc/E$ for electrons. Mixing eV and joule. All electrons having $K_{max}$.
**Teach it:** Ask: "Very bright red light below threshold: any emission?" (none, ordinary intensities). Explain one photon to one electron, like a single coin that must meet the whole price.

## Atoms and Nuclei
Level: 12, JEE
Keywords: bohr model, hydrogen spectrum, rydberg formula, alpha scattering, binding energy, mass defect, nuclear fission, fusion, radioactivity, half life, x rays
**Key results:** One-electron ion, fixed nucleus: $r_n=0.529n^2/Z$ angstrom, $v_n=2.19\times10^6Z/n$ m/s, $E_n=-13.6Z^2/n^2$ eV, $K=-E$, $U=2E$, $L=nh/2\pi$. $\frac1\lambda=RZ^2(\frac1{n_f^2}-\frac1{n_i^2})$, $R=1.097\times10^7$ m$^{-1}$. Head-on alpha, heavy nucleus: $d=\frac{2kZe^2}{K}$. $R\approx1.2A^{1/3}$ fm. $BE=[Zm_H+Nm_n-M]c^2$ ($M$ atomic mass); 1 u $\to$ 931.5 MeV. $N=N_0e^{-\lambda t}$, $T_{1/2}=\ln2/\lambda$, $\tau=1/\lambda$, activity $\lambda N$. Atomic masses: $\beta^-$ $Q=(M_P-M_D)c^2$; $\beta^+$ subtract further $2m_ec^2$. X-ray $\lambda_{min}=hc/eV$; Moseley $\sqrt f=a(Z-b)$.
**Methods:** Many atoms from level $n$: up to $n(n-1)/2$ lines. Fission, fusion, alpha: $Q$ = products' BE minus reactants'. Alpha decay at rest, ground state: $K_\alpha=Q(A-4)/A$. Parallel decays: add $\lambda$.
**Common mistakes:** Applying Bohr to neutral helium. Comparing total instead of per-nucleon binding energy for stability. Longest wavelength is smallest energy gap.
**Teach it:** Ask: "After three half-lives, what fraction remains?" (1/8). Energy is released when products are more tightly bound: draw the BE per nucleon curve.

## Semiconductor Electronics
Level: 12, JEE
Keywords: semiconductor, p type, n type, pn junction, diode, forward bias, reverse bias, rectifier, zener diode, led, photodiode, solar cell, logic gates
**Key results:** Thermal equilibrium: $n_en_h=n_i^2$; $\sigma=e(n_e\mu_e+n_h\mu_h)$. Donors (group 15) give n-type, acceptors (group 13) p-type in Si/Ge; crystal stays neutral. $E_g$: Si about 1.1 eV, Ge about 0.7 eV; conduction rises with $T$. Forward bias narrows depletion region; reverse widens. Ideal-diode rectifier, no filter, peak $V_0$: half-wave mean $V_0/\pi$, ripple frequency $f$; full-wave $2V_0/\pi$, $2f$. Zener in breakdown: $I_S=(V_{in}-V_Z)/R_S=I_Z+I_L$, $I_Z\ge0$. Detection needs $hf\ge E_g$; LED $\lambda\approx hc/E_g$. $\overline{A+B}=\bar A\bar B$, $\overline{AB}=\bar A+\bar B$.
**Methods:** Assume each diode on or off, solve, check consistency (current forward, or reverse voltage). Zener: first remove it and see if load voltage exceeds $V_Z$. Gates: build truth table stepwise. NAND and NOR are universal.
**Common mistakes:** n-type called negatively charged. Diode treated as ohmic. Photodiode is reverse biased, LED forward, solar cell unbiased. Expecting a voltmeter across an unconnected diode to read the barrier potential.
**Teach it:** Ask: "Does doping add net charge?" (no). Explain the junction as diffusion exposing fixed ions whose field then opposes further diffusion.

## Experimental Skills and Practicals
Level: 11, 12, JEE
Keywords: vernier calipers, screw gauge, least count, zero error, practicals, resonance tube, metre bridge experiment, half deflection, spherometer, graph slope, parallax, pendulum experiment
**Key results:** Vernier: $LC=1$ MSD $-$ 1 VSD (VSD smaller). Screw: $LC=$ pitch / circular divisions. Corrected = main + coinciding division $\times LC$ $-$ zero error (signed). Spherometer $R=\frac{l^2}{6h}+\frac h2$ ($l$ side of equilateral leg triangle). Pendulum $g=4\pi^2L/T^2$, $L$ to bob centre; $\frac{\Delta g}{g}=\frac{\Delta L}{L}+\frac{2\Delta t}{t}$, $t$ for $n$ swings. Resonance tube $v=2f(l_2-l_1)$, $e=(l_2-3l_1)/2$. Wire $Y=\frac{MgL}{\pi r^2\Delta L}$. Half deflection (series $R$, shunt $S$): $G=\frac{RS}{R-S}$.
**Methods:** Linearise: $T^2$ vs $L$, $1/v$ vs $1/u$; take slope from well-separated points on the best line. Metre bridge: balance near middle, interchange gaps to reduce end error. Optics bench: remove parallax. State precaution with the error it removes.
**Common mistakes:** Sign of zero error. Ignoring backlash (turn one way). Connecting a voltmeter in series. Using raw data points for slope. Quoting more digits than least count allows.
**Teach it:** Ask: "With jaws closed, the circular-scale zero sits 3 divisions below the reference line: add or subtract the correction?" (positive error, subtract). Practise with a drawn scale: measure the closed reading first.

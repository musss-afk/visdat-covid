document.addEventListener("DOMContentLoaded", function() {
    // --- 1. SETUP ---
    const topN = 20;
    let timer;
    let isPlaying = false;
    let selectedMetric = 'New Cases';
    let allData, nestedData, dateRange, filteredDateRange;

    // Formatters
    const parseDate = d3.timeParse("%m/%d/%Y");
    const formatDate = d3.timeFormat("%b %d, %Y");
    const formatNumber = d3.format(",.0f");

    // Dimensions
    const mainMargin = { top: 20, right: 30, bottom: 20, left: 150 };
    const mainWidth = 960 - mainMargin.left - mainMargin.right;
    const mainHeight = 550 - mainMargin.top - mainMargin.bottom;

    const contextMargin = { top: 10, right: 30, bottom: 30, left: 30 };
    const contextWidth = 960 - contextMargin.left - contextMargin.right;
    const contextHeight = 100 - contextMargin.top - contextMargin.bottom;

    // Main Chart SVG
    const svg = d3.select("#main-chart")
        .attr("width", mainWidth + mainMargin.left + mainMargin.right)
        .attr("height", mainHeight + mainMargin.top + mainMargin.bottom)
        .append("g")
        .attr("transform", `translate(${mainMargin.left},${mainMargin.top})`);

    // Context Chart SVG
    const contextSvg = d3.select("#context-chart")
        .attr("width", contextWidth + contextMargin.left + contextMargin.right)
        .attr("height", contextHeight + contextMargin.top + contextMargin.bottom)
        .append("g")
        .attr("transform", `translate(${contextMargin.left},${contextMargin.top})`);

    // Tooltip
    const tooltip = d3.select("#tooltip");

    // Scales
    const xScale = d3.scaleLinear().range([0, mainWidth]);
    const yScale = d3.scaleBand().range([0, mainHeight]).padding(0.1);
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

    const contextXScale = d3.scaleTime().range([0, contextWidth]);
    const contextYScale = d3.scaleLinear().range([contextHeight, 0]);

    // Axes
    const xAxis = d3.axisTop(xScale).ticks(5, "s").tickSize(-mainHeight);
    const xAxisGroup = svg.append("g").attr("class", "x-axis");
    const yAxisGroup = svg.append("g").attr("class", "y-axis");

    // UI Elements
    const dateSlider = d3.select("#date-slider");
    const dateDisplay = d3.select("#date-display");
    const playPauseButton = d3.select("#play-pause-button");
    const metricSelect = d3.select("#metric-select");

    // --- 2. DATA LOADING & PROCESSING ---
    d3.csv("covid_indonesia_province_cleaned.csv").then(data => {
        // Parse data
        allData = data.map(d => {
            d.Date = parseDate(d.Date);
            d['New Cases'] = +d['New Cases'];
            d['New Deaths'] = +d['New Deaths'];
            d['Total Cases'] = +d['Total Cases'];
            d['Total Deaths'] = +d['Total Deaths'];
            d['Total Recovered'] = +d['Total Recovered'];
            d.Province = d.Province.trim();
            return d;
        });

        // Group data by date
        nestedData = d3.group(allData, d => d.Date);
        dateRange = Array.from(nestedData.keys()).sort(d3.ascending);
        filteredDateRange = dateRange;

        // Set up slider
        dateSlider.attr("max", dateRange.length - 1);

        // Setup context chart
        setupContextChart();
        
        // Initial chart render
        update(0);

        // --- 3. EVENT LISTENERS ---
        playPauseButton.on("click", togglePlay);
        dateSlider.on("input", () => update(+dateSlider.property("value")));
        metricSelect.on("change", () => {
            selectedMetric = metricSelect.property("value");
            updateContextChart(); // Update context chart domain
            update(+dateSlider.property("value"), true); // Re-render main chart
        });

    }).catch(error => {
        console.error("Error loading data:", error);
    });

    // --- 4. CONTEXT CHART (BRUSH) ---
    function setupContextChart() {
        const nationalTotals = Array.from(nestedData, ([date, values]) => {
            return {
                date: date,
                value: d3.sum(values, v => v[selectedMetric])
            };
        });

        contextXScale.domain(d3.extent(dateRange));
        contextYScale.domain([0, d3.max(nationalTotals, d => d.value)]);

        const contextArea = d3.area()
            .x(d => contextXScale(d.date))
            .y0(contextHeight)
            .y1(d => contextYScale(d.value));

        contextSvg.append("path")
            .datum(nationalTotals)
            .attr("class", "context-area")
            .attr("d", contextArea);

        contextSvg.append("g")
            .attr("class", "context-axis")
            .attr("transform", `translate(0,${contextHeight})`)
            .call(d3.axisBottom(contextXScale).ticks(d3.timeYear.every(1)));

        // Annotations
        const annotations = [
            { date: "2021-07-15", label: "Puncak Gelombang Delta" },
            { date: "2022-02-15", label: "Puncak Gelombang Omicron" }
        ];

        annotations.forEach(ann => {
            const xPos = contextXScale(parseDate(ann.date.replace(/-/g, '/')));
            const g = contextSvg.append("g");
            g.append("line")
                .attr("class", "annotation-line")
                .attr("x1", xPos).attr("x2", xPos)
                .attr("y1", 0).attr("y2", contextHeight);
            g.append("text")
                .attr("class", "annotation-text")
                .attr("x", xPos)
                .attr("y", 10)
                .text(ann.label);
        });

        // Brush
        const brush = d3.brushX()
            .extent([[0, 0], [contextWidth, contextHeight]])
            .on("end", brushed);

        contextSvg.append("g")
            .attr("class", "brush")
            .call(brush);

        function brushed({ selection }) {
            if (selection) {
                const [x0, x1] = selection.map(contextXScale.invert);
                filteredDateRange = dateRange.filter(d => d >= x0 && d <= x1);
            } else {
                filteredDateRange = dateRange;
            }
            dateSlider.attr("max", filteredDateRange.length - 1);
            dateSlider.property("value", 0);
            update(0);
        }
    }
    
    function updateContextChart() {
        const nationalTotals = Array.from(nestedData, ([date, values]) => {
            return {
                date: date,
                value: d3.sum(values, v => v[selectedMetric])
            };
        });
        
        contextYScale.domain([0, d3.max(nationalTotals, d => d.value)]);
        
        const contextArea = d3.area()
            .x(d => contextXScale(d.date))
            .y0(contextHeight)
            .y1(d => contextYScale(d.value));
            
        contextSvg.select(".context-area")
            .datum(nationalTotals)
            .transition().duration(500)
            .attr("d", contextArea);
    }

    // --- 5. MAIN CHART UPDATE FUNCTION ---
    function update(dateIndex, domainChanged = false) {
        if (!filteredDateRange || filteredDateRange.length === 0) return;
        
        const currentDate = filteredDateRange[dateIndex];
        dateDisplay.text(formatDate(currentDate));
        dateSlider.property("value", dateIndex);

        let currentData = Array.from(nestedData.get(currentDate) || [])
            .sort((a, b) => b[selectedMetric] - a[selectedMetric])
            .slice(0, topN)
            .filter(d => d[selectedMetric] > 0);

        // Update scales
        yScale.domain(currentData.map(d => d.Province));
        
        const maxVal = d3.max(currentData, d => d[selectedMetric]);
        xScale.domain([0, maxVal > 0 ? maxVal : 1]);

        // Update axes
        xAxisGroup
            .transition().duration(300)
            .call(xAxis);
        
        yAxisGroup
            .transition().duration(300)
            .call(d3.axisLeft(yScale).tickSize(0).tickPadding(5));
            
        yAxisGroup.selectAll(".tick text").remove(); // Remove default labels

        const transitionDuration = isPlaying ? 250 : 0;
        
        // --- DATA JOIN (Bars) ---
        const bars = svg.selectAll("rect.bar")
            .data(currentData, d => d.Province);

        bars.enter()
            .append("rect")
            .attr("class", "bar")
            .attr("y", d => yScale(d.Province))
            .attr("height", yScale.bandwidth())
            .attr("x", 0)
            .attr("width", 0)
            .style("fill", d => colorScale(d.Province))
            .on("mouseover", (event, d) => {
                tooltip.style("opacity", 1)
                       .html(`<strong>${d.Province}</strong><br>${selectedMetric}: ${formatNumber(d[selectedMetric])}`);
            })
            .on("mousemove", (event) => {
                tooltip.style("left", (event.pageX + 15) + "px")
                       .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                tooltip.style("opacity", 0);
            })
            .merge(bars)
            .transition().duration(transitionDuration)
            .attr("y", d => yScale(d.Province))
            .attr("width", d => xScale(d[selectedMetric]))
            .attr("height", yScale.bandwidth());

        bars.exit()
            .transition().duration(transitionDuration)
            .attr("width", 0)
            .remove();

        // --- DATA JOIN (Province Labels) ---
        const labels = svg.selectAll("text.bar-label")
            .data(currentData, d => d.Province);

        labels.enter()
            .append("text")
            .attr("class", "bar-label")
            .attr("y", d => yScale(d.Province) + yScale.bandwidth() / 2)
            .attr("x", -5)
            .text(d => d.Province)
            .merge(labels)
            .transition().duration(transitionDuration)
            .attr("y", d => yScale(d.Province) + yScale.bandwidth() / 2);

        labels.exit().remove();
        
        // --- DATA JOIN (Value Labels) ---
        const values = svg.selectAll("text.value-label")
            .data(currentData, d => d.Province);

        values.enter()
            .append("text")
            .attr("class", "value-label")
            .attr("y", d => yScale(d.Province) + yScale.bandwidth() / 2)
            .attr("x", d => xScale(d[selectedMetric]) + 5)
            .text(d => formatNumber(d[selectedMetric]))
            .merge(values)
            .transition().duration(transitionDuration)
            .attr("x", d => xScale(d[selectedMetric]) + 5)
            .tween("text", function(d) {
                const i = d3.interpolate(Number(this.textContent.replace(/,/g, '')) || 0, d[selectedMetric]);
                return function(t) {
                    this.textContent = formatNumber(i(t));
                };
            })
            .attr("y", d => yScale(d.Province) + yScale.bandwidth() / 2);
            
        values.exit()
            .transition().duration(transitionDuration)
            .attr("x", 0)
            .remove();
    }

    // --- 6. ANIMATION CONTROLS ---
    function togglePlay() {
        if (isPlaying) {
            clearInterval(timer);
            playPauseButton.text("Play");
        } else {
            playPauseButton.text("Pause");
            timer = setInterval(() => {
                let currentValue = +dateSlider.property("value");
                let maxValue = +dateSlider.attr("max");
                if (currentValue < maxValue) {
                    currentValue++;
                    update(currentValue);
                } else {
                    clearInterval(timer);
                    isPlaying = false;
                    playPauseButton.text("Play");
                }
            }, 150); // Kecepatan animasi
        }
        isPlaying = !isPlaying;
    }
});